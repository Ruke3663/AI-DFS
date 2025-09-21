import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// File Upload Component
const FileUploader = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (selectedFile) => {
    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tags', tags);
    formData.append('is_public', isPublic);

    try {
      const response = await axios.post(`${API}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        onUploadSuccess(response.data);
        setFile(null);
        setTags("");
        setIsPublic(false);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-uploader">
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          onChange={(e) => handleFileSelect(e.target.files[0])}
          style={{ display: 'none' }}
          accept="*"
        />
        
        {file ? (
          <div className="file-selected">
            <div className="file-icon">📄</div>
            <div className="file-info">
              <div className="file-name">{file.name}</div>
              <div className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">☁️</div>
            <div className="upload-text">
              <strong>Drop files here or click to browse</strong>
              <p>Supports images, documents, PDFs, and more</p>
            </div>
          </div>
        )}
      </div>

      {file && (
        <div className="upload-options">
          <div className="form-group">
            <label>Tags (comma separated):</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., work, document, important"
              className="tags-input"
            />
          </div>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Make file public
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="upload-btn"
          >
            {uploading ? '🔄 Analyzing with AI...' : '🚀 Upload & Analyze'}
          </button>
        </div>
      )}
    </div>
  );
};

// AI Analysis Display Component
const AIAnalysisCard = ({ analysis }) => {
  if (!analysis || Object.keys(analysis).length === 0) {
    return null;
  }

  return (
    <div className="ai-analysis-card">
      <div className="analysis-header">
        <span className="ai-badge">🤖 AI Analysis</span>
        <span className="model-badge">{analysis.ai_model}</span>
      </div>
      
      <div className="analysis-content">
        {analysis.classification && (
          <div className="analysis-item">
            <strong>Classification:</strong> {analysis.classification}
          </div>
        )}
        
        {analysis.summary && (
          <div className="analysis-item">
            <strong>Summary:</strong> {analysis.summary}
          </div>
        )}
        
        {analysis.description && (
          <div className="analysis-item">
            <strong>Description:</strong> {analysis.description}
          </div>
        )}
        
        {analysis.key_topics && (
          <div className="analysis-item">
            <strong>Key Topics:</strong> {Array.isArray(analysis.key_topics) ? analysis.key_topics.join(', ') : analysis.key_topics}
          </div>
        )}
        
        {analysis.key_subjects && (
          <div className="analysis-item">
            <strong>Key Subjects:</strong> {Array.isArray(analysis.key_subjects) ? analysis.key_subjects.join(', ') : analysis.key_subjects}
          </div>
        )}
        
        {analysis.entities && (
          <div className="analysis-item">
            <strong>Entities:</strong> {Array.isArray(analysis.entities) ? analysis.entities.join(', ') : analysis.entities}
          </div>
        )}
        
        {analysis.tags && analysis.tags.length > 0 && (
          <div className="analysis-item">
            <strong>AI Tags:</strong>
            <div className="tags-container">
              {analysis.tags.map((tag, index) => (
                <span key={index} className="tag">{tag}</span>
              ))}
            </div>
          </div>
        )}
        
        {analysis.confidence && (
          <div className="analysis-item">
            <strong>Confidence:</strong> 
            <span className={`confidence ${analysis.confidence}`}>{analysis.confidence}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// File Card Component
const FileCard = ({ file }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.startsWith('text/')) return '📝';
    if (fileType.includes('video')) return '🎥';
    if (fileType.includes('audio')) return '🎵';
    return '📁';
  };

  return (
    <div className="file-card">
      <div className="file-header">
        <div className="file-icon-large">{getFileIcon(file.file_type)}</div>
        <div className="file-details">
          <h3 className="file-name">{file.original_filename}</h3>
          <p className="file-meta">
            {(file.file_size / 1024 / 1024).toFixed(2)} MB • {formatDate(file.upload_timestamp)}
          </p>
        </div>
      </div>

      {file.tags && file.tags.length > 0 && (
        <div className="file-tags">
          {file.tags.map((tag, index) => (
            <span key={index} className="tag">{tag}</span>
          ))}
        </div>
      )}

      <AIAnalysisCard analysis={file.ai_analysis} />
    </div>
  );
};

// Search Component
const SearchBar = ({ onSearch }) => {
  const [query, setQuery] = useState("");
  const [searchTags, setSearchTags] = useState("");

  const handleSearch = () => {
    onSearch({
      query,
      tags: searchTags ? searchTags.split(',').map(t => t.trim()) : null
    });
  };

  return (
    <div className="search-bar">
      <div className="search-inputs">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files, content, or AI insights..."
          className="search-input"
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <input
          type="text"
          value={searchTags}
          onChange={(e) => setSearchTags(e.target.value)}
          placeholder="Filter by tags (comma separated)"
          className="tags-filter-input"
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
      </div>
      <button onClick={handleSearch} className="search-btn">
        🔍 Search
      </button>
    </div>
  );
};

// Analytics Component
const Analytics = ({ analytics }) => {
  if (!analytics) return null;

  return (
    <div className="analytics-section">
      <h2>📊 Platform Analytics</h2>
      <div className="analytics-grid">
        <div className="stat-card">
          <div className="stat-number">{analytics.total_files}</div>
          <div className="stat-label">Total Files</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-number">{analytics.ai_analysis_rate}</div>
          <div className="stat-label">AI Analysis Rate</div>
        </div>
        
        {analytics.file_type_distribution && analytics.file_type_distribution.length > 0 && (
          <div className="file-types-card">
            <h3>File Types</h3>
            {analytics.file_type_distribution.slice(0, 5).map((type, index) => (
              <div key={index} className="type-stat">
                <span>{type._id}</span>
                <span>{type.count}</span>
              </div>
            ))}
          </div>
        )}
        
        {analytics.top_tags && analytics.top_tags.length > 0 && (
          <div className="top-tags-card">
            <h3>Popular Tags</h3>
            <div className="popular-tags">
              {analytics.top_tags.slice(0, 10).map((tag, index) => (
                <span key={index} className="popular-tag">
                  {tag._id} ({tag.count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [files, setFiles] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upload');

  useEffect(() => {
    loadFiles();
    loadAnalytics();
  }, []);

  const loadFiles = async () => {
    try {
      const response = await axios.get(`${API}/files`);
      setFiles(response.data);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const handleUploadSuccess = (uploadResult) => {
    loadFiles();
    loadAnalytics();
    setActiveTab('files');
  };

  const handleSearch = async (searchParams) => {
    try {
      const response = await axios.post(`${API}/search`, searchParams);
      setFiles(response.data);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const resetSearch = () => {
    loadFiles();
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">🧠</div>
            <div className="brand-text">
              <h1>IntelliShare</h1>
              <p>Smart File Sharing with AI Intelligence</p>
            </div>
          </div>
        </div>
      </header>

      <nav className="app-nav">
        <button 
          className={`nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📤 Upload
        </button>
        <button 
          className={`nav-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          📁 Files ({files.length})
        </button>
        <button 
          className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          📊 Analytics
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'upload' && (
          <div className="upload-section">
            <h2>🚀 Upload & Analyze Files</h2>
            <FileUploader onUploadSuccess={handleUploadSuccess} />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="files-section">
            <div className="files-header">
              <h2>📁 Your Smart Files</h2>
              <SearchBar onSearch={handleSearch} />
              <button onClick={resetSearch} className="reset-btn">
                Clear Search
              </button>
            </div>
            
            {loading ? (
              <div className="loading">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📂</div>
                <h3>No files yet</h3>
                <p>Upload your first file to see AI analysis in action!</p>
              </div>
            ) : (
              <div className="files-grid">
                {files.map((file) => (
                  <FileCard key={file.id} file={file} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <Analytics analytics={analytics} />
        )}
      </main>
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-branding">
            <span className="footer-logo">🧠</span>
            <span className="footer-text">IntelliShare</span>
          </div>
          <div className="footer-tagline">
            Powered by Advanced AI Technology
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;