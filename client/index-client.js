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
      var ledArrayOffset = ledIndex * BytesPerLed;
      var r = this.ledColorValues[ledArrayOffset + 0];
      var g = this.ledColorValues[ledArrayOffset + 1];
      var b = this.ledColorValues[ledArrayOffset + 2];
      return "#" + ("0" + r.toString(16)).substr(-2) + ("0" + g.toString(16)).substr(-2) + ("0" + b.toString(16)).substr(-2);
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
  if (typeof message != 'string')
  {
    message = JSON.stringify(message)
  }
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

function setLedColor(ledIndex, r, g, b) {
  var ledArrayOffset = ledIndex * BytesPerLed;
  Vue.set(app.ledColorValues, ledArrayOffset + 0, r);
  Vue.set(app.ledColorValues, ledArrayOffset + 1, g);
  Vue.set(app.ledColorValues, ledArrayOffset + 2, b);
}

setLedColor(1,255,0,255);
setLedColor(4,255,255,255);