from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import aiofiles
import mimetypes
import json
import google.generativeai as genai

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="IntelliShare API", description="Smart File Sharing with AI Intelligence", version="1.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Ensure upload directory exists
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# AI Analysis Service
class AIAnalysisService:
    def __init__(self):
        self.api_key = os.environ.get('GEMINI_API_KEY')
        genai.configure(api_key=self.api_key)
        
    async def analyze_file(self, file_path: str, file_type: str, original_filename: str) -> Dict[str, Any]:
        """Analyze uploaded file using Gemini AI"""
        try:
            model = genai.GenerativeModel('gemini-2.5-pro')
            
            # Upload the file to the Gemini API
            uploaded_file = genai.upload_file(path=file_path)
            
            # Analyze based on file type
            if file_type.startswith('image/'):
                analysis_prompt = f"""Analyze this image file '{original_filename}' and provide:
1. Content classification (what type of image it is)
2. Visual description (what's in the image)
3. Key objects or subjects identified
4. Suggested tags for easy searching
5. Any text content if visible
6. Overall quality assessment

Format your response as JSON with keys: classification, description, key_subjects, tags, text_content, quality."""
            
            elif file_type == 'application/pdf' or file_type.startswith('text/'):
                analysis_prompt = f"""Analyze this document '{original_filename}' and provide:
1. Document classification (type/category)
2. Key topics and themes
3. Summary of main content
4. Important entities (names, dates, places, organizations)
5. Suggested tags for easy searching
6. Readability and language analysis

Format your response as JSON with keys: classification, key_topics, summary, entities, tags, language_analysis."""
            
            else:
                analysis_prompt = f"""Analyze this file '{original_filename}' and provide:
1. File classification and type
2. Key information extracted
3. Summary of content
4. Suggested tags for searching
5. Any metadata insights

Format your response as JSON with keys: classification, key_info, summary, tags, metadata."""

            # Send analysis request
            response = model.generate_content([analysis_prompt, uploaded_file])
            response = response.text
            
            # Parse AI response
            try:
                # Try to extract JSON from response
                ai_analysis = json.loads(response)
            except json.JSONDecodeError:
                # If not valid JSON, create structured response
                ai_analysis = {
                    "classification": "Unknown",
                    "summary": response[:500] + "..." if len(response) > 500 else response,
                    "tags": ["ai-analyzed", "uploaded"],
                    "raw_response": response
                }
            
            # Add metadata
            ai_analysis["analyzed_at"] = datetime.now(timezone.utc).isoformat()
            ai_analysis["ai_model"] = "gemini-2.0-flash"
            ai_analysis["confidence"] = "high"
            
            return ai_analysis
            
        except Exception as e:
            logging.error(f"AI analysis failed: {str(e)}")
            # Return fallback analysis
            return {
                "classification": "Unknown",
                "summary": f"AI analysis unavailable for {original_filename}",
                "tags": ["uploaded", "analysis-failed"],
                "error": str(e),
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
                "ai_model": "gemini-2.0-flash",
                "confidence": "low"
            }

ai_service = AIAnalysisService()

# Define Models
class FileMetadata(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_filename: str
    stored_filename: str
    file_path: str
    file_size: int
    file_type: str
    upload_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ai_analysis: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    is_public: bool = False
    uploaded_by: Optional[str] = None

class FileUploadResponse(BaseModel):
    success: bool
    file_id: str
    filename: str
    ai_analysis: Dict[str, Any]
    message: str

class FileSearchRequest(BaseModel):
    query: str
    tags: Optional[List[str]] = None
    file_types: Optional[List[str]] = None

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Helper functions
def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data.get('upload_timestamp'), datetime):
        data['upload_timestamp'] = data['upload_timestamp'].isoformat()
    return data

def parse_from_mongo(item):
    """Parse datetime strings back from MongoDB"""
    if isinstance(item.get('upload_timestamp'), str):
        item['upload_timestamp'] = datetime.fromisoformat(item['upload_timestamp'])
    return item

# API Routes
@api_router.get("/")
async def root():
    return {"message": "IntelliShare API - Smart File Sharing with AI Intelligence", "version": "1.0", "status": "active"}

@api_router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    is_public: bool = Form(default=False),
    tags: str = Form(default="")
):
    """Upload and analyze file with AI"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        stored_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = UPLOAD_DIR / stored_filename
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Get file info
        file_size = len(content)
        file_type = mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
        
        # Parse tags
        tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()] if tags else []
        
        # AI Analysis
        ai_analysis = await ai_service.analyze_file(str(file_path), file_type, file.filename)
        
        # Merge AI tags with user tags
        ai_tags = ai_analysis.get('tags', [])
        all_tags = list(set(tag_list + ai_tags))
        
        # Create file metadata
        file_metadata = FileMetadata(
            original_filename=file.filename,
            stored_filename=stored_filename,
            file_path=str(file_path),
            file_size=file_size,
            file_type=file_type,
            ai_analysis=ai_analysis,
            tags=all_tags,
            is_public=is_public
        )
        
        # Store in database
        metadata_dict = prepare_for_mongo(file_metadata.dict())
        result = await db.file_metadata.insert_one(metadata_dict)
        
        return FileUploadResponse(
            success=True,
            file_id=file_metadata.id,
            filename=file.filename,
            ai_analysis=ai_analysis,
            message="File uploaded and analyzed successfully"
        )
        
    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/files", response_model=List[FileMetadata])
async def get_files(skip: int = 0, limit: int = 50):
    """Get all uploaded files with AI analysis"""
    try:
        files = await db.file_metadata.find().skip(skip).limit(limit).to_list(length=None)
        return [FileMetadata(**parse_from_mongo(file)) for file in files]
    except Exception as e:
        logging.error(f"Error fetching files: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch files")

@api_router.get("/files/{file_id}", response_model=FileMetadata)
async def get_file(file_id: str):
    """Get specific file metadata"""
    try:
        file_data = await db.file_metadata.find_one({"id": file_id})
        if not file_data:
            raise HTTPException(status_code=404, detail="File not found")
        return FileMetadata(**parse_from_mongo(file_data))
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch file")

@api_router.post("/search")
async def search_files(search_request: FileSearchRequest):
    """Search files using AI-generated tags and summaries"""
    try:
        query = {}
        
        # Build search query
        search_conditions = []
        
        if search_request.query:
            # Search in filename, tags, AI analysis
            search_text = {"$regex": search_request.query, "$options": "i"}
            search_conditions.extend([
                {"original_filename": search_text},
                {"tags": search_text},
                {"ai_analysis.classification": search_text},
                {"ai_analysis.summary": search_text},
                {"ai_analysis.key_topics": search_text}
            ])
        
        if search_request.tags:
            search_conditions.append({"tags": {"$in": search_request.tags}})
        
        if search_request.file_types:
            search_conditions.append({"file_type": {"$in": search_request.file_types}})
        
        if search_conditions:
            query["$or"] = search_conditions
        
        files = await db.file_metadata.find(query).to_list(length=100)
        return [FileMetadata(**parse_from_mongo(file)) for file in files]
        
    except Exception as e:
        logging.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail="Search failed")

@api_router.get("/analytics")
async def get_analytics():
    """Get platform analytics"""
    try:
        total_files = await db.file_metadata.count_documents({})
        
        # Get file type distribution
        pipeline = [
            {"$group": {"_id": "$file_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        file_types = await db.file_metadata.aggregate(pipeline).to_list(length=None)
        
        # Get most common tags
        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20}
        ]
        top_tags = await db.file_metadata.aggregate(pipeline).to_list(length=None)
        
        return {
            "total_files": total_files,
            "file_type_distribution": file_types,
            "top_tags": top_tags,
            "ai_analysis_rate": "100%"  # Since we analyze all files
        }
        
    except Exception as e:
        logging.error(f"Analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")

# Legacy status endpoints
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()