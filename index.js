/*jslint es6 */
"use strict";
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const debug = require('debug')('mazeserver');   
// set Debug env variable to * or mazeserver to see messages
// powershell: $Env:debug = "*"
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
var activeClients = new Map();

var nextClientID = 1;

wss.on('connection', (ws) => {
    var req = ws.request;
    var thisClientId = nextClientID++;
    debug('client connected, ID ', thisClientId);
    var client = {
      ws: ws
    };
    activeClients.set(thisClientId, client);
    debug(activeClients.size, 'clients connected');
    ws.send(JSON.stringify({message: 'Welcome! You are client ' + thisClientId }));

    ws.on('message', function incoming(message) {
      debug('received from client %d: %s', thisClientId, message);
    });

    ws.on('disconnect', () => {
        debug('client %d disconnected', thisClientId);
        activeClients.delete(thisClientId);
    });
});

server.listen(port, function listening() {
  debug('Listening on %d', server.address().port);
});

// send a message to all clients
function broadcast(message) {
  if ((typeof message) === 'object') {
    message = JSON.stringify(message);
  }
  activeClients.forEach(function(client, key) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

var tickCounter = 0;
// set up game timer
setInterval(() => {
  debug('game timer tick');
  broadcast({ message: 'game tick ' + tickCounter});
  tickCounter++;
}, 3000);  