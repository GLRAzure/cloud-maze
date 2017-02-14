const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const debug = require('debug');
const cfg = require('./config.json');
const mazeCommon = require('./mazecommon');

process.title = 'cloud-maze'

const port = process.env.CLOUDMAZE_PORT || 3001;

// set up webserver
app.get('/', function(req, res){
  res.sendFile(__dirname + '/website/index.html');
});
app.use(express.static(path.join(__dirname, 'website')));
const server = http.createServer(app);

// Set up Sockets
const wss = new WebSocket.Server({ server });
var activeClients = [];

wss.on('connection', (ws) => {
    var req = ws.request;
    debug('client connected');
    var client = {
      ws: ws
    };
    activeClients.push(client)

    ws.on('message', function incoming(message) {
      console.log('received: %s', message);
    });

    ws.on('disconnect', () => {
        debug('client disconnected');
    });
});

server.listen(port, function listening() {
  console.log('Listening on %d', server.address().port);
});