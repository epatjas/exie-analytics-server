// api/collect.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log('Analytics endpoint hit, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('Request body:', JSON.stringify(req.body));
    
    const { events, deviceId, appVersion, platform } = req.body;
    
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid events data' });
    }
    
    console.log(`Received ${events.length} events from ${deviceId || 'unknown'} (${platform || 'unknown'})`);
    console.log('Supabase URL:', process.env.SUPABASE_URL?.substring(0, 10) + '...');
    console.log('Supabase key present:', !!process.env.SUPABASE_SERVICE_KEY);
    
    // Process events
    let successCount = 0;
    let feedbackCount = 0;
    
    for (const event of events) {
      // Determine if this is a feedback event
      const isFeedback = 
        event.type === 'FEEDBACK_SUBMITTED' || 
        event.type === 'CONTENT_FEEDBACK' ||
        event.type === 'feedback_submitted' ||
        event.properties?.feedback_type;
      
      if (isFeedback) {
        // Insert into feedback table
        console.log('Inserting feedback event:', event.id);
        const { data, error } = await supabase
          .from('feedback')
          .insert({
            user_id: event.userId,
            feedback_type: event.properties?.feedback_type || 'general',
            is_positive: event.properties?.is_positive,
            details: event.properties,
            screenshot: event.properties?.screenshot,
            device_id: deviceId,
            app_version: appVersion,
            platform: platform,
            timestamp: event.timestamp
          });
          
        if (error) {
          console.error('Error storing feedback event:', error);
        } else {
          console.log('Feedback event stored successfully:', data);
          feedbackCount++;
        }
      } else {
        // Insert into analytics_events table
        console.log('Inserting analytics event:', event.id);
        const { data, error } = await supabase
          .from('analytics_events')
          .insert({
            event_id: event.id,
            user_id: event.userId,
            type: event.type,
            timestamp: event.timestamp,
            properties: event.properties,
            device_id: deviceId,
            app_version: appVersion,
            platform: platform,
            session_id: event.sessionId
          });
          
        if (error) {
          console.error('Error storing analytics event:', error);
        } else {
          console.log('Analytics event stored successfully:', data);
          successCount++;
        }
      }
    }
    
    const response = { 
      success: true, 
      message: `Processed ${events.length} events (${successCount} analytics, ${feedbackCount} feedback)` 
    };
    
    console.log('Sending response:', response);
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Error processing analytics:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};