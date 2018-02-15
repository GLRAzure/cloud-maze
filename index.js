/*jslint es6 */
"use strict";
const express = require('express');
const _ = require('lodash');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const winston = require('winston');   
const { debug, info, error } = winston;
// set Debug env variable to * or mazeserver to see messages
// powershell: $Env:debug = "mazeserver"
const cfg = require('./config.json');
const { GameWorld } = require('./gameworld.js');

winston.cli();
winston.level = "debug";

process.title = 'cloud-maze'
debug("starting cloud-maze");

const args = process.argv.slice(2);

const config = {
  gameworld: {
    size: [64, 32]
  },
  port: process.env.CLOUDMAZE_PORT || process.env.PORT || args[0] || 3001
}

var world = new GameWorld(config.gameworld.size[0], config.gameworld.size[1]);

// set up webserver
app.get('/', function(req, res){
  // res.sendFile(__dirname + '/website/index.html');
  res.sendFile(__dirname + '/website/overwatch.html');
});
app.use(express.static(path.join(__dirname, 'website')));
const server = http.createServer(app);

// Set up Sockets
const wss = new WebSocket.Server({ server });
var activeClients = new Map();

var nextClientID = 1;

function createPlayerClient(ws, deviceKey) {
  var req = ws.request;
  var client, name;
  if (activeClients.has(deviceKey)) {
    name = deviceKey;
    debug('reconnecting client ', deviceKey);
    client = activeClients.get(deviceKey);
    client.ws = ws;
  } else {
    var thisClientId = nextClientID++;
    name = deviceKey || 'anonymous ' + thisClientId;
    client = {
      ws,
      name,
      player: world.addPlayer(name)
    };  
    activeClients.set(name, client);
    client.player.color = getNextColor();
    debug('new client connected ', name);
  }
  
  client.sendMessage = function(body) {
    ws.send(JSON.stringify(body));
  }

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
      if (client.ws.readyState == WebSocket.OPEN) { // client disconnected
        client.ws.send(messageString);
      }
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
           sqInfo.objects.push({ type: 'player', name: obj.name, color: obj.color, away: obj.away });
            break;
        }
      });
    }
    return sqInfo;
}

wss.on('connection', (ws) => {
  var deviceKey = ws.protocol;   // TODO: use to reconnect a client to an existing session
  debug(`Client connected`);
  if (/^overwatch/.test(deviceKey)) {
    createOverwatchClient(ws);
  } else {  // default to a player client
    createPlayerClient(ws, deviceKey);
  }
});


debug('Starting up on port %d', config.port);
server.listen(config.port, function listening() {
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
    } else if (player.visitedSquares.has(worldMapSquare)) {
      return 'v';
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
      client.player.away = true;
      return;
    }
    delete client.player.away;
    
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
    if (client.lastworldUpdateMessageJson !== worldUpdateMessageJson || (client.lastMessageTicks < (ticks - 40)))  // send a periodic update regardless
    {
      client.lastworldUpdateMessageJson = worldUpdateMessageJson;
      client.lastMessageTicks = ticks;
      client.sendMessage(worldUpdateMessage);
    }
  });
  if ((ticks % 1) == 0) {
    overwatch.sendDirtySquares(25);
  }
}, 250);

var colorPointer = 0;
var colorList = ['#00FFFF','#0000FF','#A52A2A','#5F9EA0','#D2691E','#B8860B','#006400','#8B008B','#E9967A','#2F4F4F','#FF1493','#1E90FF','#ADFF2F',
      '#F0E68C','#800000','#191970','#FF4500','#BC8F8F','#FFFF00','#D8BFD8','#708090','#9ACD32','#7B68EE','#8FBC8F','#DCDCDC','#ADD8E6','#90EE90'];
function getNextColor() {
  var color = colorList[colorPointer++];
  colorPointer = colorPointer % colorList.length;  // wrap around
  return color;
}
