/*jslint es6 */
"use strict";
const express = require('express');
const _ = require('lodash');
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

const port = process.env.CLOUDMAZE_PORT || process.env.PORT || 3001;

var world = new GameWorld(64, 32);

// set up webserver
app.get('/', function(req, res){
  res.sendFile(__dirname + '/website/index.html');
  res.sendFile(__dirname + '/website/overwatch.html');
});
app.use(express.static(path.join(__dirname, 'website')));
const server = http.createServer(app);

// Set up Sockets
const wss = new WebSocket.Server({ server });
var activeClients = new Map();

var nextClientID = 1;

function createPlayerClient(ws) {

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
  // ws.send(JSON.stringify({message: 'Welcome! You are client ' + name }));

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
        if (Array.isArray(message.direction)) break; // not allowed to jump to an arbirary position
        client.player.move(message.direction);
        break;
    }
  });

  ws.on('disconnect', () => {
      debug('client %d disconnected', thisClientId);
      activeClients.delete(thisClientId);
  });
}

class Overwatch {
  constructor (world) {
    this.world = world;
    this.clients = [];
    this.squareState = [];  // a JSON string formatted representation of each square as we last sent it to overwatch
    var index = 0;
    // preload the state table with the starting state so we don't send everything right away
    for(let worldSquare of this.world.iterateMap()) {
      this.squareState[index] = JSON.stringify(toClientWorldSquare(worldSquare));
      index++;
    }
  }

  sendDirtySquares(limit) {  // limit = max number of squares to send in one message
    var squares = this.world.iterateMap();
    var dirtyList = [];
    var squareIndex = 0;
    // make a list of dirty squares by comparing prior state to new state
    for (let worldSquare of squares) {
      var clientSquare = toClientWorldSquare(worldSquare);
      var clientSquareJson = JSON.stringify(clientSquare);
      if (this.squareState[squareIndex] != clientSquareJson) {
        dirtyList.push(worldSquare);
        this.squareState[squareIndex] = clientSquareJson;
        if (dirtyList.length >= limit) {
          this.sendDirtyList(dirtyList);
          dirtyList = [];
        }
      }
      squareIndex++;
    }
    this.sendDirtyList(dirtyList);
  }

  sendDirtyList(dirtyList) {
    if (!dirtyList.length) return; 
    debug("%d dirty squares found, sending to overwatchers", dirtyList.length);
    var clientSquareList = dirtyList.map((sq) => toClientWorldSquare(sq,true) );
        var message = { 
          type: 'overwatch-update',
          squares: clientSquareList 
        };
        var messageString = JSON.stringify(message);
        for(let c in this.clients) {
          var client = this.clients[c];
          client.ws.send(messageString);
        }
  }
}


var overwatch = new Overwatch(world);

function createOverwatchClient(ws) {
  var thisOwClient = {
    ws,
    sendMapState: (offset, length) => {
      length = length || ((world.height * world.width) - offset);
      const MaxSquaresPerMessage = 50;
      var targetOffset = offset + length;
      var curOffset = offset;
      while (curOffset < targetOffset) {
        var thisChunkLength = Math.min(MaxSquaresPerMessage, targetOffset - curOffset);
        var squares = getWorldSquares(curOffset, thisChunkLength);
        ws.send(JSON.stringify({
          type: 'overwatch-update',
          squares
        }));
        curOffset += thisChunkLength;
      };     
    }
  };

  overwatch.clients.push(thisOwClient);
  // send the initial state
  ws.send(JSON.stringify(getWorldState(world)));
  thisOwClient.sendMapState(0);
  
}

function getWorldState(world) {
  var r = { 
    type: 'overwatch-init',
    width: world.width,
    height: world.height,
  };
  return r;
}

function getWorldSquares(skip, take) {
  if (Array.isArray(skip)) // coordinates were supplied
  {
    var skipArray = skip;
    skip = (skipArray[1] * this.world.width) + skipArray[0];
  }
  take = take || 1;
  var squareArray = Array.from(world.iterateMap(skip, take));
  var output = squareArray.map(toClientWorldSquare);
  output[0].position = squareArray[0].position; // put the position in the first square only 
  return output;
}

function toClientWorldSquare(worldSquare, includeCoords) {  // maps from the GameWorldSquare format to the wire format we send the clients  
    var sqInfo = { type: worldSquare.type };    
    if (includeCoords) sqInfo.position = worldSquare.position;
    if (worldSquare.objects.size) {
      sqInfo.objects =  [];
      worldSquare.objects.forEach(function (obj) {
        switch (obj.type) {
          case 'player': 
            sqInfo.objects.push({ type: 'player', name: obj.name });
            break;
        }
      });
    }
    return sqInfo;
}

wss.on('connection', (ws) => {
  var deviceKey = ws.protocol;   // TODO: use to reconnect a client to an existing session
  if (/^overwatch/.test(deviceKey)) {
    createOverwatchClient(ws);
  } else {  // default to a player client
    createPlayerClient(ws);
  }
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
    } else if (worldMapSquare.type == 'wall') {
      return 'w';
    }
    return ' '; // space = empty
  }).join('');
}

var ticks = 0;
// set up game timer
setInterval(() => {
  ticks++;
  var clientList = activeClients.values();
  // debug('game timer tick. clients connected: ' + activeClients.size);
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
      surroundings: buildSurroundingsMap(client.player, world)  // w: wall, (space): empty, p: player, c: chest
    };
    // surpress world updates if nothing has changed
    var worldUpdateMessageJson = JSON.stringify(worldUpdateMessage);
    if (client.lastworldUpdateMessageJson !== worldUpdateMessageJson)
    {
      client.lastworldUpdateMessageJson = worldUpdateMessageJson;
      client.sendMessage(worldUpdateMessage);
    }
  });
  if ((ticks % 1) == 0) {
    overwatch.sendDirtySquares(25);
  }
}, 250);

