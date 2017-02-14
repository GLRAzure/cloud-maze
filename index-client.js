import _ from 'lodash';
import Vue from 'vue';
import mazecommon from './mazecommon.js';

var app = new Vue({
  el: '#app',
  data: {
    messageText: '{}'
  },
  methods: {
    sendMessage: function () {},
    leftButton: function () {},
    upButton: function () {},
    downButton: function () {},
    rightButton: function () {},
    aButton: function () {},
    bButton: function () {},
  }
})


const socket = new WebSocket('ws://' + window.location.host);

// Connection opened
socket.addEventListener('open', function (event) {
    socket.send('Hello Server!');
});

// Listen for messages
socket.addEventListener('message', function (event) {
    console.log('Message from server', event.data);
    messageText += event.data + '\n';    
});