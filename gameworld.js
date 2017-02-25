"use strict";
const debug = require('debug')('gameworld');
/*
  Map coordinates are specified in a two-int array, x, y. So [4, 3] is x=4, y=3. Various places may have
  shortcut methods that expose x and y values that map to/from these structures.
*/ 



class MapSquare {
  constructor(world,x,y) {
    this.world = world;
    this.position = [x, y];
    this.type = 'empty';
    this.objects = new Set();
  }
}

class GamePlayer {
  constructor(world, name) {
    this.world = world;
    this.name = name;
    this.actionQueue = [];
    var x = Math.floor(Math.random() * world.width); // random placement
    var y = Math.floor(Math.random() * world.height);
    this.position = [x,y];
  }

  get x() { return this.position[0]; }
  get y() { return this.position[1]; }

  queueAction(action) {
    this.actionQueue.push(action);
  }

  move(direction) {
    this.queueAction({action:'move', direction});
  }
}

class DefaultLayoutBuilder {
  // from https://en.wikipedia.org/wiki/Maze_generation_algorithm : Recursive backtracker
  // neighbors are spaced two apart to make room for walls between each maze square
  constructor(world) {
    this.world = world;
  }
  neighborList(square) {
    var neighborCoords = [[-2,0],[0,-2],[2,0],[0,2]]
      .map(GameWorld.transformCoords(square.position))
      .filter((coords) => this.world.isInBounds(coords)); // remove out of bounds
    var list = neighborCoords
      .map((coords) => this.world.getSquare(coords));    // get squares
    return list;
  }
  getInbetweenSquare(s1, s2) { // find the square between two squares separted by one space
    var x = (s1.position[0] + s2.position[0]) / 2;
    var y = (s1.position[1] + s2.position[1]) / 2;
    return this.world.getSquare([x,y]);
  }
  buildLayout() {
    // fill the world with walls
    for(var sq of this.world.iterateMap()) {
      sq.type = 'wall';
    }
    var visisted = new Set();
    var pathStack = [];
    var startingCoords = [Math.floor(Math.random() * this.world.width), Math.floor(Math.random() * this.world.height)];
    var thisSq =  this.world.getSquare(startingCoords);
    while ((visisted.size < (this.world.width * this.world.height)) && thisSq) {
      debug('visiting square ', thisSq.position );
      thisSq.type = 'empty';
      visisted.add(thisSq);
      var neighbors = this.neighborList(thisSq);
      var unvisitedNeighbors = neighbors.filter((sq) => !visisted.has(sq)); // unvisited neighbors
      if (unvisitedNeighbors.length) {
        var nextSq = unvisitedNeighbors[Math.floor(Math.random() * unvisitedNeighbors.length)]; // randomly pick a neighbor
        pathStack.push(nextSq);
        var inbetweenSquare = this.getInbetweenSquare(thisSq, nextSq);
        inbetweenSquare.type = 'empty';  // open a path to the next square
        thisSq = nextSq;
      } else { // no empty neighbors
        thisSq = pathStack.pop(); // pop the last square from the stack
      }
    }

  }
}

class GameWorld {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.players = new Set();
    this.layoutBuilder = new DefaultLayoutBuilder(this);
    this.buildMap();
  }

  // offsets coordiate a by relative value b (returning a new value)
  static transformCoords(a, b) {
    if (!b) { // return a closure if only a first parameter was specified
      return function (c) { return GameWorld.transformCoords(a, c); };
    } else {
      return [a[0] + b[0],a[1] + b[1]];
    }
  }

  isInBounds(coords) { // return true if coords is in the bounds of this map
    return ((coords[0] >= 0 && coords[0] < this.width) && (coords[1] >= 0 && coords[1] < this.height));
  }

  *iterateMap() {
    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        yield this.map[x][y];
      }
    }
  }

  getSquare(coords) {
    if (!this.isInBounds(coords)) return null;
    return this.map[coords[0]][coords[1]];
  };

  buildMap() {
    this.map = [];
    for(var y = 0; y < this.height; y++) {
      for(var x = 0; x < this.width; x++) {
        this.map[x] = this.map[x] || [];
        var thisSquare = new MapSquare(this, x, y);
        this.map[x][y] = thisSquare;
      }
    }
    this.map.getByCoords = (coords) => {
      return this.map[coords[0]][coords[1]];
    };
    this.layoutBuilder.buildLayout();

  }

  getWorldSquare(coords) {
    if (!this.isInBounds(coords)) return null; 
    return this.map[coords[0]][coords[1]];
  }

  isInBounds(coords) {
    if (coords[0] < 0 || coords[0] >= this.width) return false;
    if (coords[1] < 0 || coords[1] >= this.height) return false;
    return true;
  }

  addPlayer(name) {
    var newPlayer = new GamePlayer(this, name);
    this.players.add(newPlayer);
    return newPlayer;
  }

  movePlayer(player, direction) {
    var proposedPosition = player.position;

    switch (direction) {
      case 'north': proposedPosition = GameWorld.transformCoords(player.position, [ 0,-1]); break;
      case 'south': proposedPosition = GameWorld.transformCoords(player.position, [ 0, 1]); break;
      case 'west':  proposedPosition = GameWorld.transformCoords(player.position, [-1, 0]); break;
      case 'east':  proposedPosition = GameWorld.transformCoords(player.position, [ 1, 0]); break;
    }
    if (this.isInBounds(proposedPosition)) {
        var oldSq = this.map.getByCoords(player.position);
        oldSq.objects.delete(player);
        player.position = proposedPosition;
        var newSq = this.map.getByCoords(player.position);
        newSq.objects.add(player);
    }
  }

  tick() {
    var world = this;
    this.time++;
    this.players.forEach((player) => {
      while (player.actionQueue.length) {
        var thisAction = player.actionQueue.shift();
        switch (thisAction.action) {
          case 'move':
            world.movePlayer(player,thisAction.direction);
            break;
        }
      }
    });
  }
}

module.exports.GameWorld = GameWorld;