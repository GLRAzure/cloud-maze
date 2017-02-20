/*jslint es6 */
"use strict";
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const debug = require('debug')('mazeserver');   
// set Debug env variable to * or mazeserver to see messages
// powershell: $Env:debug = "mazeserver"
const cfg = require('./config.json');
const mazeCommon = require('./mazecommon');
const { GameWorld } = require('./gameworld.js');

process.title = 'cloud-maze'

const port = process.env.CLOUDMAZE_PORT || 3001;

var world = new GameWorld(100,100);

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
    var name = 'anonymous ' + thisClientId;
    var client = {
      ws,
      name,    
      player: world.addPlayer(name)
    };
    
    client.sendMessage = function(body) {
      ws.send(JSON.stringify(body));
    }

    activeClients.set(thisClientId, client);
    debug(activeClients.size, 'clients connected');
    ws.send(JSON.stringify({message: 'Welcome! You are client ' + name }));

    ws.on('message', function incoming(messageText) {
      debug("received from client '%s': %s", name, messageText);
      var message;
      try {
        message = JSON.parse(messageText);
      }
      catch (err) {
        debug("unrecognized/non-JSON message from client '%s': '%s' ", name, messageText);

      }
      switch(message.action) {
        case 'move':
          debug('player ' + name + ' moving ' + message.direction);
          client.player.move(message.direction);
          break;
      }
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

// a map of surrounding squares by relative coordinates
const SurroundingsTxCoords = [  [-1,-1], [ 0, -1], [ 1, -1],
                                [-1, 0], [ 0,  0], [ 1,  0],
                                [-1, 1], [ 0,  1], [ 1,  1] ];

function buildSurroundingsMap(player, world) {
  return SurroundingsTxCoords.map(function (txCoords) {
    var thisMapCoord = GameWorld.transformCoords(player.position, txCoords);
    var worldMapSquare = world.getWorldSquare(thisMapCoord);
    if (worldMapSquare == null) { // not a valid map coordiate position, probably outside borders
      return 'w'; // wall (outside border)
    }
    return ' '; // space = empty
  }).join('');
}

// set up game timer
setInterval(() => {
  var clientList = activeClients.values();
  debug('game timer tick. clients connected: ' + activeClients.size);
  // broadcast({ message: 'game time: ' + world.time});
  world.tick();
  activeClients.forEach(function (client, key) {
    // debug('handling world-update for ' + client.name);
    if (client.ws.readyState !== WebSocket.OPEN) { // client disconnected
      return;
    }
    
    var worldUpdateMessage = {
      type: 'world-update',
      player: client.player.name,
      pos_x: client.player.x,
      pos_y: client.player.y,
      player_count: world.players.size,
      surroundings: buildSurroundingsMap(client.player, world)  // 'w cwp ww '   // w: wall, (space): empty, p: player, c: chest
    };
    // surpress world updates if nothing has changed
    var worldUpdateMessageJson = JSON.stringify(worldUpdateMessage);
    if (client.lastworldUpdateMessageJson !== worldUpdateMessageJson)
    {
      client.lastworldUpdateMessageJson = worldUpdateMessageJson;
      client.sendMessage(worldUpdateMessage);
    }
  });
}, 250);

