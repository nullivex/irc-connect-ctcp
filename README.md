irc-connect-ctcp
================

CTCP plugin for irc-connect

Basic CTCP support, emits 'ctcp_request' and 'ctcp_response' events.

Currently responds to 'PING', 'TIME', and 'VERSION' requests but is easily extensible.

DCC CHAT and DCC SEND are in development and work well,
currently only incoming requests (aka outgoing sockets) are supported.

DCC SEND will shove received files in your os.tmpdir() and won't overwrite anything.
There are no options to adjust this yet.

### example
```js
var irc = require('irc-connect')
var ircCtcp = require('irc-connect-ctcp')

var client = irc.connect(...)

//simply toss the module reference into client.use()
// NOTE dcc is optional, load only if you need it as it's probably a security risk
client.use(irc.pong,ircCtcp,ircCtcp.dcc)

//set a CTCP VERSION reply
// example result: 'irc-connect-ctcp:SomeApp v4.2:NodeJS=0.10.30+(V8=3.14.5.9)'
client.ctcp.setOption('version','SomeApp v4.2')
//set a CTCP VERSION reply, no extra formatting
// example result: 'SomeApp v4.2'
client.ctcp.setOption('versionRaw','SomeApp v4.2')

//CTCP general usage clues
// events for incoming req/res
client.on('ctcp_request',...)
client.on('ctcp_response',...)
// methods for outgoing req/res
client.sendCtcpRequest(target, type, params)
client.sendCtcpResponse(target, type, params)
//bind your event handlers and then fire off the send

//DCC assigns a 'handle' (random string) to each new 'session'
// use this handle to identify the session to various functions

// DCC CHAT incoming request
client.on('ctcp_dcc_chat_request',function(event){
  //figure out if you want to accept this DCC CHAT, if you do...
  client.acceptDccRequest(event.handle)
  //otherwise, ignore it and nothing further will happen
})
client.on('ctcp_dcc_chat_error',...)      // any errors, reason is in event.message
client.on('ctcp_dcc_chat_connecting',...) // socket connecting
client.on('ctcp_dcc_chat_connect',...)    // socket connected
client.on('ctcp_dcc_chat_message',...)    // they sent a line, in event.message
client.on('ctcp_dcc_chat_close',...)      // socket closed (complete or not)

// DCC SEND incoming request
client.on('ctcp_dcc_send_request',function(event){
  //event.filename, and if given event.size, are provided to you for decision
  //figure out if you want to accept this DCC SEND, and if you do...
  client.acceptDccRequest(event.handle)
  //otherwise, ignore it and nothing further will happen
})
client.on('ctcp_dcc_send_error',...)      // any errors, reason is in event.message
client.on('ctcp_dcc_send_connecting',...) // socket connecting
client.on('ctcp_dcc_send_connect',...)    // socket connected
client.on('ctcp_dcc_send_open',...)       // file has been opened
client.on('ctcp_dcc_send_progress',...)   // fired once a second until xfer complete
client.on('ctcp_dcc_chat_close',...)      // socket closed (complete or not)
// generally a final progress event will occur for the final file flush
// (close is sent on socket end)
// if event.wrote != event.size at the end, something failed, good luck
```

This is a very incomplete example, run with ```DEBUG=irc:ctcp*``` to see all the
events and data it throws (until such time as this documentation is completed)
