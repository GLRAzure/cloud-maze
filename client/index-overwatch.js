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
        thisWorld.loadSquares(message.squares);
        thisWorld.render.redrawWorld();
        break;
    }
});

class WorldInfo {
    constructor(message) {
      this.width = message.width;
      this.height = message.height;
      this.map = [];
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
            thisSq.coords = thisCoords;
            console.log('loading square', thisCoords);
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
    }

    redrawWorld() {
        for (var thisSq of this.world.squareIterator()) {
            this.drawSquare(thisSq);
        }
    }
}