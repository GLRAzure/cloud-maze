import Vue from 'vue';
import { fabric } from 'fabric';

// var app = new Vue({
//   el: '#app',
//   data: {
   
//   },
//   methods: {
  
//   }
// });

var worldCanvas = document.querySelector('#mapCanvas');

// var canvas = new fabric.Canvas('mapCanvas', {
//   backgroundColor: 'rgb(60,60,60)',
//   selectionColor: 'blue',
//   selectionLineWidth: 2,
//   selection: false
// });

function resizeCanvas() {
    var container = document.querySelector(".topPanel");
    worldCanvas.width = (container.clientWidth);
    worldCanvas.height = (container.clientHeight);
}

resizeCanvas();

// resizeCanvas();

// // create a rectangle object
// var rect = new fabric.Rect({
//   left: 100,
//   top: 100,
//   fill: 'red',
//   width: 20,
//   height: 20
// });

// "add" rectangle onto canvas
// canvas.add(rect);

var thisWorld = null;

// web socket setup
const socket = new WebSocket('ws://' + window.location.host, 'overwatch');
// Listen for messages
socket.addEventListener('message', function (event) {
    console.log('Message from server', event.data);
    var message = JSON.parse(event.data);
    switch (message.type) {
      case 'overwatch-init':
        thisWorld = new WorldInfo(message);
        thisWorld.render = new WorldRenderer(thisWorld, worldCanvas);
        break;
      case 'overwatch-update':
        if (message.squares) thisWorld.loadSquares(message.squares);
        if (message.players) thisWorld.loadPlayers(message.players);
        thisWorld.render.redrawWorld();
        break;
    }
});

class WorldInfo {
    constructor(message) {
      this.width = message.width;
      this.height = message.height;
      this.map = [];
      this.players = [];
      var sqCounter = 0;    
    }

    loadSquares(squares) {
    var thisCoords = [0,0];
    for(var i in squares) {
        var thisSq = squares[i];
        if (thisSq.position) {
            thisCoords = thisSq.position;
            delete thisSq.position;
        }
        thisSq.coords = [thisCoords[0],thisCoords[1]];
        // console.log('loading square', thisCoords, thisSq);
        this.map[thisCoords[0]] = this.map[thisCoords[0]] || [];
        this.map[thisCoords[0]][thisCoords[1]] = thisSq;

        thisCoords[0]++;
        if (thisCoords[0] >= this.width) { // move to the next row?
            thisCoords[0] = 0;
            thisCoords[1]++;
            if (thisCoords[1] >= this.height) throw "moved past bottom of the map"
        }
        }
    }

    loadPlayers(players) {
        this.players = players; 
    }
      
    update(message) {

    }

    *squareIterator() {
    for(var y = 0; y < this.height; y++) {
        for(var x = 0; x < this.width; x++) {
            if (this.map && this.map.length > x && this.map[x] && this.map[x].length > y && this.map[x][y]) {
                yield this.map[x][y];
                }
            }
        }
    }
}

class WorldRenderer {
    constructor(world, canvas) {
        this.world = world;
        this.canvas = canvas;
        this.resetCanvasSize();
        this.context = canvas.getContext('2d');
        this.redrawWorld();
    }

    resetCanvasSize() {
        this.squareSize = Math.min(this.canvas.width / this.world.width,this.canvas.height / this.world.height);
        this.topOffset = Math.max(0, (this.canvas.height - (this.world.height * this.squareSize)) / 2);
        this.leftOffset = Math.max(0, (this.canvas.width - (this.world.width * this.squareSize)) / 2);
    }

    rectBox(coords) {
        var x1 = (coords[0] * this.squareSize) + this.leftOffset;
        var y1 = (coords[1] * this.squareSize) + this.topOffset;
        this.context.beginPath();
        this.context.rect(x1, y1, this.squareSize, this.squareSize);
    }

    getBoxCenter(coords) {  // map coords to center of canvas coords
        return [(coords[0] * this.squareSize) + this.leftOffset + (this.squareSize / 2),
                (coords[1] * this.squareSize) + this.topOffset + (this.squareSize / 2)];
    }

    getStyle(square) {
        var style = {};
        style.stroke = "#404040";
        switch(square.type) {
            case ('empty'):
                style.fill = "black";
                break;
            case ('wall'):
                style.fill = "#d0ded4";
                break;
        }
        return style;
    }

    drawSquare(square) {
        var style = this.getStyle(square);
        this.rectBox(square.coords);
        if (style.fill) {
            this.context.fillStyle = style.fill;
            this.context.fill();
        }
        if (style.stroke) {
            this.context.strokeStyle = style.stroke;
            this.context.stroke();
        }

        if (square.objects) {
            for(var i in square.objects) {
                var obj = square.objects[i];
                switch (obj.type) {
                    case 'player':
                      this.context.beginPath();
                      var center = this.getBoxCenter(square.coords);
                      this.context.arc(center[0], center[1], this.squareSize / 3, 0, 2 * Math.PI, false);
                      if (obj.away) {
                        this.context.strokeStyle = obj.color || 'white';
                        this.context.stroke();
                      } else {
                        this.context.fillStyle = obj.color || 'white';
                        this.context.fill();
                      }
                      break;
                }
            }
        }
    }

    redrawWorld() {
        for (var thisSq of this.world.squareIterator()) {
            this.drawSquare(thisSq);
        }
    }
}