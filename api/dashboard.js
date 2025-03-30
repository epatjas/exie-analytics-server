const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  try {
    console.log('Dashboard API called');

    // Get total events count
    const { count: totalEvents, error: countError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    console.log('Total events query completed');
    
    // Get unique users
    const { data: uniqueUsers, error: usersError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .not('user_id', 'is', null);
      
    if (usersError) throw usersError;
    
    const uniqueUserCount = new Set(uniqueUsers?.map(u => u.user_id) || []).size;
    console.log('Unique users query completed');
    
    // Get weekly retention rate
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('analytics_events')
      .select('properties, user_id')
      .eq('type', 'ACTIVE_WEEK')
      .order('timestamp', { ascending: true });
      
    if (weeklyError) throw weeklyError;
    console.log('Weekly retention query completed');
    
    // Process weekly data to calculate retention
    const userWeeks = new Map();
    weeklyData.forEach(event => {
      if (event.user_id && event.properties?.week_key) {
        if (!userWeeks.has(event.user_id)) {
          userWeeks.set(event.user_id, new Set());
        }
        userWeeks.get(event.user_id).add(event.properties.week_key);
      }
    });
    
    // Calculate users with consecutive weeks
    let usersWithConsecutiveWeeks = 0;
    let totalUsersWithMultipleWeeks = 0;
    
    userWeeks.forEach(weeks => {
      if (weeks.size > 1) {
        totalUsersWithMultipleWeeks++;
        
        // Convert to array and sort
        const sortedWeeks = Array.from(weeks).sort();
        
        // Check for consecutive weeks
        let hasConsecutive = false;
        for (let i = 1; i < sortedWeeks.length; i++) {
          // Simple check - if any consecutive weeks exist, count this user
          if (sortedWeeks[i].startsWith(sortedWeeks[i-1].split('-')[0]) && 
              parseInt(sortedWeeks[i].split('-')[1]) === parseInt(sortedWeeks[i-1].split('-')[1]) + 1) {
            hasConsecutive = true;
            break;
          }
        }
        
        if (hasConsecutive) {
          usersWithConsecutiveWeeks++;
        }
      }
    });
    
    const weeklyRetentionRate = totalUsersWithMultipleWeeks > 0 
      ? (usersWithConsecutiveWeeks / totalUsersWithMultipleWeeks) * 100 
      : 0;
    
    // Get study sets per active user
    const { data: studySetData, error: studySetError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .eq('type', 'study_set_created');
      
    if (studySetError) throw studySetError;
    console.log('Study sets query completed');
    
    // Count study sets per user
    const studySetsByUser = new Map();
    studySetData.forEach(event => {
      if (event.user_id) {
        studySetsByUser.set(
          event.user_id, 
          (studySetsByUser.get(event.user_id) || 0) + 1
        );
      }
    });
    
    const totalStudySets = studySetData.length;
    const studySetsPerUser = uniqueUserCount > 0 
      ? totalStudySets / uniqueUserCount 
      : 0;
    
    // Get session data for all study activities
    const { data: studySessionData, error: studySessionError } = await supabase
      .from('analytics_events')
      .select('properties')
      .eq('type', 'session_end')
      .or('properties->>context.eq.study_set,properties->>context.eq.quiz,properties->>context.eq.flashcards');
      
    if (studySessionError) throw studySessionError;
    console.log('Study session duration query completed');

    // Calculate combined average study session duration
    let totalStudyDuration = 0;
    let studySessionCount = 0;

    // Variables for separate tracking
    let studySetDuration = 0;
    let studySetCount = 0;
    let quizDuration = 0;
    let quizCount = 0;
    let flashcardDuration = 0;
    let flashcardCount = 0;

    studySessionData.forEach(event => {
      if (event.properties?.duration_seconds) {
        const duration = parseFloat(event.properties.duration_seconds);
        if (!isNaN(duration)) {
          // Add to total for combined metric
          totalStudyDuration += duration;
          studySessionCount++;
          
          // Add to context-specific totals
          if (event.properties.context === 'study_set') {
            studySetDuration += duration;
            studySetCount++;
          } else if (event.properties.context === 'quiz') {
            quizDuration += duration;
            quizCount++;
          } else if (event.properties.context === 'flashcards') {
            flashcardDuration += duration;
            flashcardCount++;
          }
        }
      }
    });

    // Calculate averages for each context
    const avgStudySessionDuration = studySessionCount > 0 ? totalStudyDuration / studySessionCount : 0;
    const avgStudySetDuration = studySetCount > 0 ? studySetDuration / studySetCount : 0;
    const avgQuizDuration = quizCount > 0 ? quizDuration / quizCount : 0;
    const avgFlashcardDuration = flashcardCount > 0 ? flashcardDuration / flashcardCount : 0;
    
    // Return dashboard HTML with key metrics prominently displayed
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lexie analytics dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            /* Import Geist font locally */
            @font-face {
              font-family: 'Geist';
              src: url('/fonts/Geist-Regular.woff2') format('woff2');
              font-weight: 400;
              font-style: normal;
              font-display: swap;
            }
            
            @font-face {
              font-family: 'Geist';
              src: url('/fonts/Geist-Medium.woff2') format('woff2');
              font-weight: 500;
              font-style: normal;
              font-display: swap;
            }
            
            @font-face {
              font-family: 'Geist';
              src: url('/fonts/Geist-SemiBold.woff2') format('woff2');
              font-weight: 600;
              font-style: normal;
              font-display: swap;
            }
            
            @font-face {
              font-family: 'Geist';
              src: url('/fonts/Geist-Bold.woff2') format('woff2');
              font-weight: 700;
              font-style: normal;
              font-display: swap;
            }
            
            /* Dark theme colors from screenshot */
            :root {
              --bg-color: #121212;
              --card-bg: #1E1E1E;
              --text-color: #FFFFFF;
              --text-secondary: rgba(255, 255, 255, 0.7);
              --border-color: #333333;
              --highlight-blue: #4299e1;
              --highlight-yellow: #D6B656;
              --highlight-green: #82CCBC;
              --tab-active-color: #4299e1;
              --tab-inactive-color: #555555;
              --header-height: 60px;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              background-color: var(--bg-color);
              color: var(--text-color);
              max-width: 1200px; 
              margin: 0 auto; 
              padding: 0;
            }
            
            .header {
              height: var(--header-height);
              display: flex;
              align-items: center;
              padding: 0 20px;
              border-bottom: 1px solid var(--border-color);
            }
            
            .title {
              font-size: 18px;
              font-weight: 500;
              flex: 1;
            }
            
            .tab-container {
              display: flex;
              padding: 0 20px;
              border-bottom: 1px solid var(--border-color);
            }
            
            .tab {
              padding: 15px 0;
              margin-right: 40px;
              font-size: 16px;
              position: relative;
              cursor: pointer;
            }
            
            .tab.active {
              color: var(--text-color);
              font-weight: 500;
            }
            
            .tab.active:after {
              content: '';
              position: absolute;
              bottom: -1px;
              left: 0;
              right: 0;
              height: 2px;
              background-color: var(--tab-active-color);
            }
            
            .tab:not(.active) {
              color: var(--text-secondary);
            }
            
            .content {
              padding: 20px;
            }
            
            .section-title {
              font-size: 16px;
              font-weight: 500;
              margin: 20px 0 15px 0;
            }
            
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 20px;
              margin-bottom: 20px;
            }
            
            .card {
              background-color: var(--card-bg);
              border-radius: 12px;
              padding: 20px;
              position: relative;
              overflow: hidden;
            }
            
            .big-card {
              grid-column: 1 / -1;
            }
            
            .metric-title {
              font-size: 14px;
              color: var(--text-secondary);
              margin-bottom: 30px;
              margin-top: 10px;
            }
            
            .metric-value {
              font-size: 42px;
              font-weight: 700;
              margin-bottom: 5px;
            }
            
            .metric-unit {
              font-size: 14px;
              font-weight: 400;
              color: var(--text-secondary);
            }
            
            .metric-description {
              font-size: 14px;
              color: var(--text-secondary);
              margin-top: 5px;
            }
            
            .icon {
              position: absolute;
              top: 20px;
              right: 20px;
              width: 24px;
              height: 24px;
              opacity: 0.5;
            }
            
            .bar-container {
              display: flex;
              align-items: flex-end;
              height: 140px;
              gap: 40px;
              margin-top: 30px;
              padding: 0 40px;
            }
            
            .bar-group {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            
            .bar {
              width: 100%;
              border-radius: 4px 4px 0 0;
              margin-bottom: 10px;
            }
            
            .bar-study {
              background-color: var(--highlight-blue);
            }
            
            .bar-quiz {
              background-color: var(--highlight-yellow);
            }
            
            .bar-flashcard {
              background-color: var(--highlight-green);
            }
            
            .bar-value {
              font-size: 14px;
              color: var(--text-secondary);
              margin-bottom: 5px;
            }
            
            .bar-label {
              font-size: 14px;
              color: var(--text-secondary);
            }
            
            .updated-at {
              text-align: right;
              font-size: 12px;
              color: var(--text-secondary);
              margin-top: 10px;
              padding-right: 20px;
            }
            
            .user-icon {
              color: var(--text-color);
              font-size: 24px;
            }
            
            /* Icons using SVG */
            .icon svg {
              width: 24px;
              height: 24px;
              fill: var(--text-secondary);
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Lexie analytics dashboard</div>
          </div>
          
          <div class="tab-container">
            <div class="tab active">Metrics</div>
            <a href="/feedback" style="text-decoration:none;"><div class="tab">Feedback</div></a>
            <div class="updated-at">Last updated: ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="content">
            <div class="section-title">Key metrics</div>
            <div class="metrics-grid">
              <div class="card">
                <div class="icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                  </svg>
                </div>
                <div class="metric-title">All time users</div>
                <div class="metric-value">${uniqueUserCount || 0}</div>
              </div>
              
              <div class="card">
                <div class="icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
                  </svg>
                </div>
                <div class="metric-title">Weekly return rate</div>
                <div class="metric-value">${weeklyRetentionRate.toFixed(0)}%</div>
              </div>
              
              <div class="card">
                <div class="icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V4C20 2.9 19.1 2 18 2ZM9 4H11V9L10 8.25L9 9V4ZM18 20H6V4H7V13L10 10.75L13 13V4H18V20Z" fill="currentColor"/>
                  </svg>
                </div>
                <div class="metric-title">Study sets per user</div>
                <div class="metric-value">${studySetsPerUser.toFixed(1)}</div>
              </div>
            </div>
            
            <div class="section-title">Activity metrics</div>
            <div class="metrics-grid">
              <div class="card">
                <div class="metric-title">Time spent with study set</div>
                <div class="metric-value">${(avgStudySetDuration / 60).toFixed(1)}<span class="metric-unit"> min</span></div>
                <div class="metric-description">Average time per study set (${studySetCount} sessions)</div>
              </div>
              
              <div class="card">
                <div class="metric-title">Time spent with quiz</div>
                <div class="metric-value">${(avgQuizDuration / 60).toFixed(1)}<span class="metric-unit"> min</span></div>
                <div class="metric-description">Average time per quiz (${quizCount} sessions)</div>
              </div>
              
              <div class="card">
                <div class="metric-title">Time spent with flashcard</div>
                <div class="metric-value">${(avgFlashcardDuration / 60).toFixed(1)}<span class="metric-unit"> min</span></div>
                <div class="metric-description">Average time per flashcard set (${flashcardCount} sessions)</div>
              </div>
              
              <div class="card big-card">
                <div class="metric-title">Time spent comparison</div>
                <div class="bar-container">
                  <div class="bar-group">
                    <div class="bar-value">${(avgStudySetDuration / 60).toFixed(1)}</div>
                    <div class="bar bar-study" style="height: ${Math.min(100, Math.max(5, (avgStudySetDuration / 60) * 20))}px;"></div>
                    <div class="bar-label">Study set</div>
                  </div>
                  <div class="bar-group">
                    <div class="bar-value">${(avgQuizDuration / 60).toFixed(1)}</div>
                    <div class="bar bar-quiz" style="height: ${Math.min(100, Math.max(5, (avgQuizDuration / 60) * 20))}px;"></div>
                    <div class="bar-label">Quizzes</div>
                  </div>
                  <div class="bar-group">
                    <div class="bar-value">${(avgFlashcardDuration / 60).toFixed(1)}</div>
                    <div class="bar bar-flashcard" style="height: ${Math.min(100, Math.max(5, (avgFlashcardDuration / 60) * 20))}px;"></div>
                    <div class="bar-label">Flashcards</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Dashboard error details:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body style="background-color: #121212; color: white; font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
          <h1>Error loading dashboard</h1>
          <p>${error.message}</p>
          <p><a href="/feedback" style="color: #4299e1;">View Feedback</a></p>
        </body>
      </html>
    `);
  }
};