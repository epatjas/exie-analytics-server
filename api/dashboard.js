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
      .eq('type', 'STUDY_SET_CREATED');
      
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
    
    // Get average session duration
    const { data: sessionData, error: sessionError } = await supabase
      .from('analytics_events')
      .select('properties, user_id')
      .eq('type', 'SESSION_END');
      
    if (sessionError) throw sessionError;
    console.log('Session duration query completed');
    
    // Calculate average session duration overall and per user
    let totalDuration = 0;
    let sessionCount = 0;
    const userSessions = new Map();
    
    sessionData.forEach(event => {
      if (event.properties?.duration_seconds) {
        const duration = parseFloat(event.properties.duration_seconds);
        if (!isNaN(duration)) {
          totalDuration += duration;
          sessionCount++;
          
          if (event.user_id) {
            if (!userSessions.has(event.user_id)) {
              userSessions.set(event.user_id, []);
            }
            userSessions.get(event.user_id).push(duration);
          }
        }
      }
    });
    
    const avgSessionDuration = sessionCount > 0 
      ? totalDuration / sessionCount 
      : 0;
    
    // Return dashboard HTML with key metrics prominently displayed
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lexie Analytics Dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              max-width: 1200px; 
              margin: 0 auto; 
              padding: 20px;
              background-color: #f9f9f9;
              color: #333;
            }
            h1, h2 { color: #2c3e50; }
            .dashboard {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
              gap: 20px;
              margin-top: 24px;
            }
            .card {
              background-color: white;
              border-radius: 10px;
              padding: 20px;
              box-shadow: 0 3px 10px rgba(0,0,0,0.08);
            }
            .card h2 {
              margin-top: 0;
              font-size: 18px;
              color: #4a5568;
              font-weight: 600;
            }
            .metric {
              font-size: 36px;
              font-weight: 700;
              margin: 15px 0;
              color: #2d3748;
            }
            .metric-description {
              font-size: 14px;
              color: #718096;
              margin-bottom: 12px;
            }
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
            .hero-metrics {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 24px;
              margin: 30px 0;
            }
            .hero-metric {
              background-color: #fff;
              border-radius: 12px;
              padding: 25px;
              text-align: center;
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            .hero-value {
              font-size: 60px;
              font-weight: 800;
              color: #1a202c;
              margin: 10px 0;
            }
            .hero-label {
              font-size: 18px;
              color: #4a5568;
              margin-bottom: 5px;
            }
            .key-metrics-title {
              font-size: 24px;
              font-weight: 600;
              color: #2c3e50;
              margin-top: 40px;
              margin-bottom: 20px;
            }
            @media (max-width: 767px) {
              .hero-metrics {
                grid-template-columns: 1fr;
              }
              .hero-value {
                font-size: 42px;
              }
            }
          </style>
        </head>
        <body>
          <h1>Lexie Analytics Dashboard</h1>
          <div class="nav-links">
            <a href="/feedback" class="nav-link">View Feedback</a>
            <span>Last updated: ${new Date().toLocaleString()}</span>
          </div>
          
          <div class="key-metrics-title">INITIAL TESTING RESULTS AND KEY METRICS</div>
          <div class="hero-metrics">
            <div class="hero-metric">
              <div class="hero-value">${weeklyRetentionRate.toFixed(0)}%</div>
              <div class="hero-label">of users return weekly</div>
            </div>
            
            <div class="hero-metric">
              <div class="hero-value">${studySetsPerUser.toFixed(2)}</div>
              <div class="hero-label">study sets created per active user</div>
            </div>
            
            <div class="hero-metric">
              <div class="hero-value">${(avgSessionDuration / 60).toFixed(0)}</div>
              <div class="hero-label">minute<br>Time spent per study session</div>
            </div>
          </div>
          
          <h2>Additional Analytics</h2>
          <div class="dashboard">
            <div class="card">
              <h2>Total Events</h2>
              <div class="metric">${totalEvents || 0}</div>
              <div class="metric-description">Total analytics events tracked</div>
            </div>
            
            <div class="card">
              <h2>Unique Users</h2>
              <div class="metric">${uniqueUserCount || 0}</div>
              <div class="metric-description">Distinct users identified</div>
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
        <body>
          <h1>Error loading dashboard</h1>
          <p>${error.message}</p>
          <p><a href="/feedback">View Feedback</a></p>
        </body>
      </html>
    `);
  }
};