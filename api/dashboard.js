const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  try {
    console.log('Dashboard API called');

    // Simplify to just one query
    const { count: totalEvents, error: countError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    console.log('Total events query completed');
    
    // Return a simplified dashboard
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Simple Dashboard Test</title></head>
        <body>
          <h1>Lexie Analytics Dashboard</h1>
          <p>Total Events: ${totalEvents || 0}</p>
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