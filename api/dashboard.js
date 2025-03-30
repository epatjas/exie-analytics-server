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
    
    // Return the complete dashboard with all metrics sections
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
              --highlight-blue: #98BDF7;             /* blue */
              --highlight-yellow: hsl(51, 60%, 55%); /* yellowMedium */
              --highlight-green: hsl(156, 48%, 63%); /* mint */
              --icon-color: #4aded3;                 /* mint/teal color from screenshot */
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
            
            .header {
              display: flex;
              align-items: center;
              padding: 32px;
              /* Removed border-bottom */
            }
            
            .title {
              font-size: 20px;
              font-weight: 400;
              color: var(--text-color);
            }
            
            .tabs {
              display: flex;
              padding: 0 20px;
              border-bottom: 1px solid var(--border-color);
              position: relative;
              margin-bottom: 40px;
              align-items: center;
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
              color: var(--text-secondary);
              margin-top: 0;
              margin-bottom: 0;
              padding-top: 0;
              padding-bottom: 0;
              display: flex;
              align-items: center;
              height: 100%;
            }
            
            .content {
              padding: 0 20px;
            }
            
            .section-title {
              font-size: 16px;
              font-weight: 300;
              margin-bottom: 20px;
            }
            
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-bottom: 40px;
            }
            
            .card {
              background-color: var(--card-bg);
              border-radius: 12px;
              padding: 30px 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              position: relative;
              border: 1px solid var(--border-color);
            }
            
            .icon {
              margin-bottom: 15px;
            }
            
            .icon svg {
              width: 24px;
              height: 24px;
              stroke: var(--icon-color);
              stroke-width: 2;
              stroke-linecap: round;
              stroke-linejoin: round;
              fill: none;
            }
            
            .metric-value {
              font-size: 42px;
              font-weight: 500;
              margin-bottom: 5px;
            }
            
            .metric-title {
              font-size: 16px;
              color: var(--text-secondary);
              font-weight: 300;
            }
            
            /* Time metrics styling */
            .time-card {
              background-color: var(--card-bg);
              border-radius: 12px;
              padding: 20px;
              text-align: left;
              border: 1px solid var(--border-color);
            }
            
            .time-title {
              font-size: 14px;
              color: var(--text-secondary);
              margin-bottom: 40px;
            }
            
            .time-value {
              font-size: 42px;
              font-weight: 500;
            }
            
            .time-unit {
              font-size: 20px;
              font-weight: 500;
              color: var(--text-secondary);
              margin-left: 5px;
            }
            
            /* Chart specific styling */
            .bar-chart-container {
              grid-column: span 3;
            }
            
            .chart-title {
              margin-bottom: 20px;
              font-size: 14px;
              color: var(--text-secondary);
            }
            
            .bar-chart {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              height: 100px;
              margin-top: 40px;
            }
            
            .bar-group {
              display: flex;
              flex-direction: column;
              align-items: center;
              width: 30%;
            }
            
            .bar-value {
              margin-bottom: 10px;
              font-size: 14px;
              color: var(--text-secondary);
            }
            
            .bar {
              width: 100%;
              border-radius: 4px 4px 0 0;
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
            
            .bar-label {
              margin-top: 10px;
              font-size: 14px;
              color: var(--text-secondary);
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Lexie analytics dashboard</div>
          </div>
          
          <div class="tabs">
            <div class="tab active">Metrics</div>
            <a href="/feedback" style="text-decoration:none;"><div class="tab">Feedback</div></a>
            <div class="updated-at">Last updated: ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="content">
            <div class="section-title">Key metrics</div>
            <div class="metrics-grid">
              <div class="card">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div class="metric-value">${uniqueUserCount || 0}</div>
                <div class="metric-title">All time users</div>
              </div>
              
              <div class="card">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 2v6h6"></path>
                    <path d="M21 12A9 9 0 0 0 6 5.3L3 8"></path>
                    <path d="M21 22v-6h-6"></path>
                    <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"></path>
                  </svg>
                </div>
                <div class="metric-value">${weeklyRetentionRate.toFixed(0)}%</div>
                <div class="metric-title">Weekly return rate</div>
              </div>
              
              <div class="card">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                  </svg>
                </div>
                <div class="metric-value">${studySetsPerUser.toFixed(1)}</div>
                <div class="metric-title">Study sets per user</div>
              </div>
            </div>
            
            <div class="section-title">Activity metrics</div>
            <div class="metrics-grid">
              <div class="time-card">
                <div class="time-title">Time spent with study set</div>
                <div class="time-value">${(avgStudySetDuration / 60).toFixed(1)}<span class="time-unit">min</span></div>
              </div>
              
              <div class="time-card">
                <div class="time-title">Time spent with quiz</div>
                <div class="time-value">${(avgQuizDuration / 60).toFixed(1)}<span class="time-unit">min</span></div>
              </div>
              
              <div class="time-card">
                <div class="time-title">Time spent with flashcard</div>
                <div class="time-value">${(avgFlashcardDuration / 60).toFixed(1)}<span class="time-unit">min</span></div>
              </div>
              
              <div class="time-card bar-chart-container">
                <div class="chart-title">Time spent comparison</div>
                <div class="bar-chart">
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