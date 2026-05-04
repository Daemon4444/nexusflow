const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, 'uploads/test.png');
const file = fs.readFileSync(filePath);
const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);

const body = Buffer.concat([
  Buffer.from(`------${boundary}\r\n`),
  Buffer.from(`Content-Disposition: form-data; name="file"; filename="test.png"\r\n`),
  Buffer.from(`Content-Type: image/png\r\n\r\n`),
  file,
  Buffer.from(`\r\n------${boundary}--\r\n`)
]);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=----${boundary}`,
    'Content-Length': body.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(body);
req.end();
