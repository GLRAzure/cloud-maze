"use strict";
import _ from 'lodash';
import Vue from 'vue';
import mazecommon from '../mazecommon.js';

const NumLeds = 9;
const BytesPerLed = 3;

var app = new Vue({
  el: '#app',
  data: {
    messageText: '{}',
    messageLog: [],
    ledColorValues: new Uint8Array(NumLeds * BytesPerLed)
  },
  methods: {
    sendMessage: function () {
      sendMessage(app.messageText);
    },
    leftButton: function () { sendMove('west'); },
    upButton: function () { sendMove('north');},
    downButton: function () { sendMove('south');},
    rightButton: function () { sendMove('east');},
    aButton: function () {},
    bButton: function () {},
    getLedColorValue: function(ledIndex) {
      var r = this.ledColorValues[ledIndex + 0];
      var g = this.ledColorValues[ledIndex + 1];
      var b = this.ledColorValues[ledIndex + 2];
      return "#" + r.toString(16) + g.toString(16) + b.toString(16);
    },
    scrollMessageBottom: function () {
      var body = document.body;
      body.scrollTop = body.scrollHeight;
    }
  }
})

function logMessage(message, from) {
  app.messageLog.push({ message, from });
  setTimeout(app.scrollMessageBottom, 1); // do this after the item is inserted
}

// web socket setup
const socket = new WebSocket('ws://' + window.location.host);

function sendMessage(message) {  // send message and log it
  app.messageText = message;
  socket.send(message);
  logMessage(message, 'client');
}

// Connection opened
socket.addEventListener('open', function (event) { 

});

// Listen for messages
socket.addEventListener('message', function (event) {
    console.log('Message from server', event.data);
    logMessage(event.data, 'cloud');
});

function sendMove(direction) {
  sendMessage({action: 'move', direction});
}