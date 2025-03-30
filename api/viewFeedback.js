const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Define tag colors based on the provided hex codes
const tagColors = {
  bug: {
    text: '#FF575E',    // Bright red
    bg: '#381516'       // Dark red background
  },
  feature: {
    text: '#72CDA8',    // Mint green
    bg: '#0F2813'       // Dark green background
  },
  content: {
    text: '#47A8FF',    // Light blue
    bg: '#022249'       // Dark blue background
  },
  ux: {
    text: '#FF9300',    // Orange
    bg: '#311E07'       // Dark brown background
  },
  other: {
    text: '#a0aec0',    // Light gray
    bg: '#2D3748'       // Dark gray background
  }
};

module.exports = async (req, res) => {
  try {
    // Get feedback from Supabase
    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);
      
    if (error) throw error;
    
    // Separate app feedback from content feedback
    const appFeedback = feedback.filter(item => 
      item.feedback_type === 'app_feedback' || 
      item.feedback_type === 'APP_FEEDBACK'
    );
    
    // Group content feedback by category
    const contentRatings = {};
    
    feedback.forEach(item => {
      if (item.feedback_type === 'flashcard_feedback' || 
          item.feedback_type === 'FLASHCARD_FEEDBACK') {
        if (!contentRatings['Flashcards']) {
          contentRatings['Flashcards'] = { positive: 0, negative: 0, total: 0 };
        }
        if (item.is_positive) contentRatings['Flashcards'].positive++;
        else contentRatings['Flashcards'].negative++;
        contentRatings['Flashcards'].total++;
      }
      else if (item.feedback_type === 'quiz_feedback' || 
               item.feedback_type === 'QUIZ_FEEDBACK') {
        if (!contentRatings['Quiz questions']) {
          contentRatings['Quiz questions'] = { positive: 0, negative: 0, total: 0 };
        }
        if (item.is_positive) contentRatings['Quiz questions'].positive++;
        else contentRatings['Quiz questions'].negative++;
        contentRatings['Quiz questions'].total++;
      }
      else if (item.feedback_type === 'content_feedback' || 
               item.feedback_type === 'CONTENT_FEEDBACK') {
        // Determine content subcategory from details if available
        let category = 'Study set';
        if (item.details && item.details.category === 'homework') {
          category = 'Homework help';
        }
        
        if (!contentRatings[category]) {
          contentRatings[category] = { positive: 0, negative: 0, total: 0 };
        }
        if (item.is_positive) contentRatings[category].positive++;
        else contentRatings[category].negative++;
        contentRatings[category].total++;
      }
    });
    
    // Format dates nicely
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    };
    
    // Get feedback types for tags
    const getFeedbackType = (item) => {
      if (item.details && item.details.category) {
        if (item.details.category === 'feature') return { name: 'Feature request', color: '#4aded3' };
        if (item.details.category === 'bug') return { name: 'Bug', color: '#e53e3e' };
        if (item.details.category === 'content') return { name: 'Content', color: '#3182ce' };
        if (item.details.category === 'ux') return { name: 'UX', color: '#dd6b20' };
        if (item.details.category === 'technical') return { name: 'Technical', color: '#718096' };
        return { name: 'Other', color: '#a0aec0' };
      }
      return { name: 'Other', color: '#a0aec0' };
    };
    
    // Format tag colors with specific colors from screenshot
    const getTagStyle = (category) => {
      switch(category) {
        case 'bug':
          return { name: 'Bug', color: '#EE5775' };
        case 'feature':
          return { name: 'Feature request', color: '#4aded3' };
        case 'content':
          return { name: 'Content', color: '#82B4F9' };
        case 'ux':
          return { name: 'UX', color: '#dd6b20' };
        case 'technical':
          return { name: 'Technical', color: '#718096' };
        default:
          return { name: 'Other', color: '#a0aec0' };
      }
    };
    
    // Return HTML page with responsive styling
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lexie analytics dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            /* Using exact color tokens from Lexie app theme */
            :root {
              --bg-color: hsl(240, 3%, 6%);          /* background */
              --card-bg: hsl(220, 6%, 10%);            /* background02 */
              --card-hover: hsl(220, 6%, 10%);       /* background01 */
              --text-color: hsl(240, 100%, 97%);     /* text */
              --text-secondary: hsl(220, 1%, 58%);   /* textSecondary */
              --border-color: hsl(230, 6%, 19%);     /* stroke */
              --highlight-blue: #82B4F9;             /* blue */
              --highlight-yellow: #C3B069;           /* Yellow */
              --highlight-green: hsl(156, 48%, 63%); /* mint */
              --icon-color: #4aded3;                 /* mint/teal color */
              --red-color: #EE5775;                  /* For negative ratings */
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              background-color: var(--bg-color);
              color: var(--text-color);
              max-width: 1200px; 
              margin: 0 auto; 
              padding: 0;
            }
            
            /* Header and content alignment */
            .header, .tabs, .content {
              padding-left: 40px; /* Consistent left padding for alignment */
              padding-right: 40px;
            }
            
            .header {
              display: flex;
              align-items: center;
              padding-top: 20px;
              padding-bottom: 20px;
            }
            
            .title {
              font-size: 18px;
              font-weight: 400;
              color: var(--text-color);
            }
            
            /* Tab container and tabs */
            .tabs {
              display: flex;
              border-bottom: 1px solid var(--border-color);
              position: relative;
              margin-bottom: 40px;
              align-items: center;
              padding-top: 0;
              padding-bottom: 0;
            }
            
            .tab {
              padding: 15px 0;
              margin-right: 40px;
              font-size: 16px;
              position: relative;
              cursor: pointer;
            }
            
            /* Fix for active tab indicator */
            .tab.active {
              color: var(--text-color);
              font-weight: 400;
            }
            
            .tab.active:after {
              content: '';
              position: absolute;
              bottom: -1px;
              left: 0;
              width: 100%; /* Match width of the tab text */
              height: 4px;
              background-color: var(--highlight-blue);
              border-radius: 4px 4px 0 0;
            }
            
            .tab:not(.active) {
              color: var(--text-secondary);
              font-weight: 400;
            }
            
            .updated-at {
              margin-left: auto;
              font-size: 12px;
              color: var(--highlight-blue);
              margin-top: 0;
              margin-bottom: 0;
              padding-top: 0;
              padding-bottom: 0;
              display: flex;
              align-items: center;
              height: 100%;
            }
            
            .content {
              padding-top: 0;
              padding-bottom: 40px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
            }
            
            /* Add background color back to main containers */
            .feedback-container, 
            .ratings-container {
              background-color: var(--card-bg);
              border-radius: 12px;
              padding: 20px;
              border: 1px solid var(--border-color);
            }
            
            /* Style individual feedback items */
            .feedback-item {
              background-color: var(--card-bg);
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 16px;
              border: 1px solid var(--border-color);
              position: relative;
            }
            
            .feedback-item:last-child {
              margin-bottom: 0;
            }
            
            .section-title {
              font-size: 16px;
              font-weight: 400;
              margin-bottom: 20px;
              color: var(--text-color);
            }
            
            .feedback-date {
              font-size: 14px;
              color: var(--text-secondary);
              margin-bottom: 12px;
            }
            
            .feedback-text {
              margin-bottom: 10px;
              line-height: 1.5;
              font-size: 15px;
            }
            
            .feedback-tag {
              display: inline-block;
              padding: 3px 10px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 400;
              position: absolute;
              top: 16px;
              right: 16px;
            }
            
            .feedback-screenshot-link {
              display: inline-block;
              color: var(--highlight-blue);
              text-decoration: none;
              font-size: 14px;
              margin-top: 10px;
            }
            
            .ratings-title {
              font-size: 14px;
              color: var(--text-secondary);
              margin-bottom: 20px;
            }
            
            .rating-item {
              margin-bottom: 20px;
            }
            
            .rating-header {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
            }
            
            .rating-label {
              font-size: 14px;
            }
            
            .rating-count {
              font-size: 14px;
              color: var(--text-secondary);
            }
            
            .rating-bar-container {
              height: 8px;
              background-color: rgba(255, 255, 255, 0.1);
              border-radius: 4px;
              overflow: hidden;
              position: relative;
              margin-bottom: 5px;
            }
            
            .rating-bar {
              height: 100%;
              background-color: var(--highlight-blue);
              border-radius: 4px;
            }
            
            .rating-details {
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: var(--text-secondary);
            }
            
            .rating-positive {
              display: flex;
              align-items: center;
            }
            
            .rating-negative {
              display: flex;
              align-items: center;
            }
            
            .thumbs-icon {
              margin-right: 5px;
            }
            
            @media (max-width: 768px) {
              .content {
                grid-template-columns: 1fr;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Lexie analytics dashboard</div>
          </div>
          
          <div class="tabs">
            <a href="/" style="text-decoration:none;"><div class="tab">Metrics</div></a>
            <div class="tab active">Feedback</div>
            <div class="updated-at">Last updated: ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="content">
            <div class="feedback-container">
              <div class="section-title">User feedback</div>
              ${appFeedback.length > 0 ? 
                appFeedback.slice(0, 5).map(item => {
                  // Determine tag type and colors
                  let tagType = 'Other';
                  let tagColor = tagColors.other;
                  
                  if (item.details && item.details.category) {
                    if (item.details.category === 'bug') {
                      tagType = 'Bug';
                      tagColor = tagColors.bug;
                    } else if (item.details.category === 'feature') {
                      tagType = 'Feature request';
                      tagColor = tagColors.feature;
                    } else if (item.details.category === 'content') {
                      tagType = 'Content';
                      tagColor = tagColors.content;
                    } else if (item.details.category === 'ux') {
                      tagType = 'UX';
                      tagColor = tagColors.ux;
                    }
                  }
                  
                  return `
                    <div class="feedback-item">
                      <div class="feedback-date">${formatDate(item.timestamp)}</div>
                      <span class="feedback-tag" style="background-color: ${tagColor.bg}; color: ${tagColor.text};">${tagType}</span>
                      <div class="feedback-text">${item.details?.feedback_text || 'No feedback text provided'}</div>
                      ${item.screenshot ? 
                        `<a href="#" class="feedback-screenshot-link">View screenshot</a>` : 
                        ''}
                    </div>
                  `;
                }).join('') : 
                '<p>No app feedback available</p>'
              }
            </div>
            
            <div class="ratings-container">
              <div class="section-title">Content ratings</div>
              <div class="ratings-title">Rating by feature</div>
              ${Object.keys(contentRatings).length > 0 ? 
                Object.entries(contentRatings).map(([category, data]) => {
                  const positivePercentage = data.total > 0 ? Math.round((data.positive / data.total) * 100) : 0;
                  const negativePercentage = 100 - positivePercentage;
                  return `
                    <div class="rating-item">
                      <div class="rating-header">
                        <div class="rating-label">${category}</div>
                        <div class="rating-count">${data.total} ratings</div>
                      </div>
                      <div class="rating-bar-container">
                        <div class="rating-bar" style="width: ${positivePercentage}%"></div>
                      </div>
                      <div class="rating-details">
                        <div class="rating-positive">
                          <span class="thumbs-icon">👍</span> ${positivePercentage}%
                        </div>
                        <div class="rating-negative">
                          <span class="thumbs-icon">👎</span> ${negativePercentage}%
                        </div>
                      </div>
                    </div>
                  `;
                }).join('') : 
                '<p>No content ratings available</p>'
              }
            </div>
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
        <body style="background-color: #121212; color: white; font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
          <h1>Error retrieving feedback</h1>
          <p>${error.message}</p>
          <p><a href="/" style="color: #4299e1;">Back to Dashboard</a></p>
        </body>
      </html>
    `);
  }
}; 