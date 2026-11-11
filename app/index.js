const express = require('express');
const client = require('prom-client');
const app = express();

app.use(express.json());

// 1. Prometheus Default Metrics (CPU/RAM of the Node process)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// 2. Custom Metrics required by assessment
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const ordersPlacedTotal = new client.Counter({
  name: 'business_orders_placed_total',
  help: 'Total number of orders successfully placed',
  labelNames: ['item_type']
});

// Middleware to track request count and latency automatically
app.use((req, res, next) => {
  if (req.path === '/metrics') return next(); // Don't track the metrics endpoint itself
  
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.path, status_code: res.statusCode });
    end({ method: req.method, route: req.path, status_code: res.statusCode });
  });
  next();
});

// 3. Application Endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

app.post('/api/orders', (req, res) => {
  // Deliberate failure mechanism for the assessment test
  if (req.query.fail === 'true' || Math.random() < 0.15) {
    return res.status(500).json({ error: 'Simulated backend database failure' });
  }
  
  // Simulate processing latency (50ms to 400ms)
  const latency = Math.floor(Math.random() * 350) + 50;
  setTimeout(() => {
    const item = req.body && req.body.item ? req.body.item : 'standard_widget';
    ordersPlacedTotal.inc({ item_type: item });
    res.status(201).json({ message: 'Order created successfully', latency_ms: latency });
  }, latency);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Order API server running on port ${PORT}`));
