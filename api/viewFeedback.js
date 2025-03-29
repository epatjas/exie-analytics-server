const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  try {
    // Get feedback from Supabase
    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);
      
    if (error) throw error;
    
    // Format feedback for display
    const feedbackHtml = feedback && feedback.length > 0 ? feedback.map(item => `
      <div class="feedback-item">
        <div class="feedback-header">
          <span class="feedback-type">${item.feedback_type || 'General'}</span>
          <span class="feedback-sentiment ${item.is_positive ? 'positive' : 'negative'}">
            ${item.is_positive ? '👍 Positive' : '👎 Negative'}
          </span>
          <span class="feedback-date">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <div class="feedback-screenshot">
          ${item.screenshot ? `
            <img src="${item.screenshot}" alt="User provided screenshot" />
          ` : ''}
        </div>
        <div class="feedback-details">
          <pre>${JSON.stringify(item.details, null, 2)}</pre>
        </div>
        <div class="feedback-meta">
          Device: ${item.device_id || 'Unknown'} (${item.platform || 'Unknown'})
        </div>
      </div>
    `).join('') : '<p>No feedback available</p>';
    
    // Return HTML page with responsive styling
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lexie Feedback</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
              max-width: 800px; 
              margin: 0 auto; 
              padding: 20px;
              background-color: #f9f9f9;
              color: #333;
            }
            h1 { color: #2c3e50; }
            .feedback-item { 
              border: 1px solid #ddd; 
              border-radius: 8px; 
              padding: 16px; 
              margin-bottom: 20px;
              background-color: white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .feedback-header { 
              display: flex; 
              flex-wrap: wrap;
              justify-content: space-between; 
              margin-bottom: 12px;
              gap: 8px;
            }
            .feedback-type { 
              font-weight: 600; 
              background-color: #e3f2fd; 
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 14px;
            }
            .feedback-sentiment { 
              padding: 4px 10px; 
              border-radius: 20px;
              font-size: 14px; 
            }
            .positive { background-color: #d4edda; color: #155724; }
            .negative { background-color: #f8d7da; color: #721c24; }
            .feedback-date { 
              color: #6c757d; 
              font-size: 14px;
              align-self: center;
            }
            .feedback-details { 
              background-color: #f8f9fa; 
              padding: 12px; 
              border-radius: 6px; 
              overflow-x: auto;
              font-size: 14px;
            }
            .feedback-meta { 
              font-size: 0.8em; 
              color: #6c757d; 
              margin-top: 12px; 
            }
            pre { white-space: pre-wrap; margin: 0; }
            .nav-links {
              display: flex;
              justify-content: space-between;
              margin: 20px 0;
            }
            .nav-link {
              background-color: #4a5568;
              color: white;
              padding: 8px 16px;
              text-decoration: none;
              border-radius: 4px;
              font-size: 14px;
            }
            .nav-link:hover {
              background-color: #2d3748;
            }
            @media (max-width: 600px) {
              .feedback-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
              }
              .feedback-item {
                padding: 12px;
              }
            }
            .feedback-screenshot {
              margin: 12px 0;
              max-width: 100%;
              overflow: hidden;
              border-radius: 8px;
            }
            .feedback-screenshot img {
              max-width: 100%;
              max-height: 400px;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <h1>Lexie Feedback Viewer</h1>
          <div class="nav-links">
            <a href="/" class="nav-link">Dashboard</a>
            <span>Showing latest ${feedback ? feedback.length : 0} feedback items</span>
          </div>
          <div class="feedback-list">
            ${feedbackHtml}
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error retrieving feedback</h1>
          <p>${error.message}</p>
          <p><a href="/">Back to Dashboard</a></p>
        </body>
      </html>
    `);
  }
}; 