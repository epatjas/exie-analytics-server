const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  try {
    // Get total events count
    const { count: totalEvents, error: countError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    
    // Get unique users
    const { data: uniqueUsers, error: usersError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .not('user_id', 'is', null);
      
    if (usersError) throw usersError;
    
    const uniqueUserCount = new Set(uniqueUsers?.map(u => u.user_id) || []).size;
    
    // Get feature usage
    const { data: featureUsage, error: featureError } = await supabase
      .from('analytics_events')
      .select('properties->>feature_name as feature, count(*)', { count: 'exact' })
      .eq('type', 'FEATURE_USE')
      .is('properties->>feature_name', 'not.null')
      .groupBy('properties->>feature_name')
      .order('count', { ascending: false });
      
    if (featureError) throw featureError;
    
    // Get screen views
    const { data: screenViews, error: screenError } = await supabase
      .from('analytics_events')
      .select('properties->>screen_name as screen, count(*)')
      .eq('type', 'SCREEN_VIEW')
      .not('properties->>screen_name', 'is', null)
      .group('properties->>screen_name')
      .order('count', { ascending: false })
      .limit(10);
      
    if (screenError) throw screenError;
    
    // Get feedback metrics
    const { data: feedbackCounts, error: feedbackError } = await supabase
      .from('feedback')
      .select('feedback_type, is_positive, count(*)')
      .group('feedback_type, is_positive');
      
    if (feedbackError) throw feedbackError;
    
    // Get device count
    const { data: devices, error: deviceError } = await supabase
      .from('analytics_events')
      .select('device_id')
      .not('device_id', 'is', null);
      
    if (deviceError) throw deviceError;
    
    const uniqueDeviceCount = new Set(devices?.map(d => d.device_id) || []).size;
    
    // Get weekly retention rate
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('analytics_events')
      .select('properties, user_id')
      .eq('type', 'ACTIVE_WEEK')
      .order('timestamp', { ascending: true });
      
    if (weeklyError) throw weeklyError;
    
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
    
    // Calculate top 5 users by average session duration
    const userAvgDurations = [];
    userSessions.forEach((durations, userId) => {
      const total = durations.reduce((sum, duration) => sum + duration, 0);
      const avg = total / durations.length;
      userAvgDurations.push({ userId, avgDuration: avg, sessions: durations.length });
    });
    
    // Sort by average duration and take top 5
    const topUsersByDuration = userAvgDurations
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 5);
    
    // Return dashboard HTML
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
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              text-align: left;
              padding: 10px;
              font-size: 14px;
            }
            th {
              border-bottom: 2px solid #edf2f7;
              color: #718096;
              font-weight: 600;
            }
            td {
              border-bottom: 1px solid #edf2f7;
            }
            tr:last-child td {
              border-bottom: none;
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
            @media (max-width: 600px) {
              .dashboard {
                grid-template-columns: 1fr;
              }
            }
            .highlight-metric {
              font-size: 24px;
              font-weight: 700;
              color: #4a5568;
              margin: 5px 0;
            }
            .key-metric {
              background-color: #ebf8ff;
              border-left: 4px solid #4299e1;
              padding-left: 16px;
            }
          </style>
        </head>
        <body>
          <h1>Lexie Analytics Dashboard</h1>
          <div class="nav-links">
            <a href="/feedback" class="nav-link">View Feedback</a>
            <span>Last updated: ${new Date().toLocaleString()}</span>
          </div>
          
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
            
            <div class="card">
              <h2>Unique Devices</h2>
              <div class="metric">${uniqueDeviceCount || 0}</div>
              <div class="metric-description">Distinct devices tracked</div>
            </div>
            
            <div class="card">
              <h2>Top Features Used</h2>
              <table>
                <tr>
                  <th>Feature</th>
                  <th>Count</th>
                </tr>
                ${featureUsage && featureUsage.length > 0 ? featureUsage.map(f => `
                  <tr>
                    <td>${f.feature || 'Unknown'}</td>
                    <td>${f.count}</td>
                  </tr>
                `).join('') : '<tr><td colspan="2">No feature usage data</td></tr>'}
              </table>
            </div>
            
            <div class="card">
              <h2>Most Viewed Screens</h2>
              <table>
                <tr>
                  <th>Screen</th>
                  <th>Views</th>
                </tr>
                ${screenViews && screenViews.length > 0 ? screenViews.map(s => `
                  <tr>
                    <td>${s.screen || 'Unknown'}</td>
                    <td>${s.count}</td>
                  </tr>
                `).join('') : '<tr><td colspan="2">No screen view data</td></tr>'}
              </table>
            </div>
            
            <div class="card">
              <h2>Feedback Summary</h2>
              <table>
                <tr>
                  <th>Type</th>
                  <th>Sentiment</th>
                  <th>Count</th>
                </tr>
                ${feedbackCounts && feedbackCounts.length > 0 ? feedbackCounts.map(f => `
                  <tr>
                    <td>${f.feedback_type || 'General'}</td>
                    <td><span style="color: ${f.is_positive ? '#38a169' : '#e53e3e'}">${f.is_positive ? 'Positive' : 'Negative'}</span></td>
                    <td>${f.count}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3">No feedback data</td></tr>'}
              </table>
            </div>
            
            <!-- Weekly Retention Rate -->
            <div class="card key-metric">
              <h2>Weekly User Retention</h2>
              <div class="metric">${weeklyRetentionRate.toFixed(1)}%</div>
              <div class="metric-description">
                ${usersWithConsecutiveWeeks} out of ${totalUsersWithMultipleWeeks} users return weekly
              </div>
            </div>
            
            <!-- Study Sets Per User -->
            <div class="card key-metric">
              <h2>Study Sets Per User</h2>
              <div class="metric">${studySetsPerUser.toFixed(1)}</div>
              <div class="metric-description">
                ${totalStudySets} study sets created by ${uniqueUserCount} users
              </div>
            </div>
            
            <!-- Session Duration -->
            <div class="card key-metric">
              <h2>Average Session Duration</h2>
              <div class="metric">${(avgSessionDuration / 60).toFixed(1)} min</div>
              <div class="metric-description">
                Based on ${sessionCount} completed sessions
              </div>
            </div>
            
            <!-- Top Users by Session Duration -->
            <div class="card">
              <h2>Top Users by Session Time</h2>
              <table>
                <tr>
                  <th>User ID</th>
                  <th>Avg. Duration</th>
                  <th>Sessions</th>
                </tr>
                ${topUsersByDuration.map(user => `
                  <tr>
                    <td>${user.userId.substring(0, 8)}...</td>
                    <td>${(user.avgDuration / 60).toFixed(1)} min</td>
                    <td>${user.sessions}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error generating dashboard:', error);
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