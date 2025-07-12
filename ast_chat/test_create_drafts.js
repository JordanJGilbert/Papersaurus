const io = require('socket.io-client');

// Connect to the backend
const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected to WebSocket');
  
  // Subscribe to a test job
  const jobId = 'test-job-' + Date.now();
  socket.emit('subscribe', { id: jobId });
  console.log('Subscribed to job:', jobId);
  
  // Listen for updates
  socket.on('job_update', (data) => {
    console.log('Job update received:', data);
  });
  
  // Simulate some progress updates
  let progress = 0;
  const interval = setInterval(() => {
    progress += 2.2; // Draft progress rate
    console.log(`Progress: ${progress.toFixed(1)}%`);
    
    if (progress >= 100) {
      clearInterval(interval);
      console.log('Test complete!');
      socket.disconnect();
      process.exit(0);
    }
  }, 1000);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});

console.log('Starting WebSocket test...');