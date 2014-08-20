irc-connect-ctcp
================
## `CTCP plugin for irc-connect`
Basic `CTCP` support, emits `'ctcp_request'` and `'ctcp_response'` events, among others.
> **PROTIP**: Run with `DEBUG=irc:ctcp*` to see all the events and data it throws, it's almost
self-documenting!

Currently includes responders to `PING`, `TIME`, and `VERSION` requests but is easily extensible.

`DCC CHAT` and `DCC SEND` are in development and work well, currently only incoming requests
(aka outgoing sockets) are supported. `DCC SEND` will unkindly shove received files in your
`os.tmpdir()` but won't overwrite (or resume) anything.  There are no options to adjust this *yet*.

# Documentation
All of the following assumes this init stub:
> ```node
var irc = require('irc-connect')
var client = irc.connect(...)
var ircCtcp = require('irc-connect-ctcp')
```

## CTCP Plugin [`client.use(ircCtcp)`]
### Setup and configurables
Access internal plugin options using methods
`client.ctcpSetOption(key, value)`
and
`client.ctcpGetOption(key)`

All settings are optional, there is a default provided for each one.

Set any of the autoresponses to literally `false` to disable the feature,
such as to install your own handler on `ctcp_response`, or go "steath".
> *__NOTE__: associative `false` such as `''` or `0` or `null` or `undefined` are all otherwise valid*

For example, with the `VERSION` responder:
> ```node
client.ctcpSetOption('versionRaw',false) // preferred
client.ctcpSetOption('version',false)    // courtesy
```
When set `false` and someone sends a `VERSION` request, there will be no response at all

#### `CTCP VERSION` responder
Default response is similar to
> `irc-connect-ctcp:UNKNOWN:NodeJS=0.10.30+(V8=3.14.5.9)`

with your environments actual versions.  Per some random official-looking protocol documentation
I read somewhere *(maybe the RFC?)* the proper format is three colon-separated elements.

Set `'version'` with a string and it will use the standard, with your string in the middle element
> ```node
client.ctcpSetOption('version','SomeApp v4.2')
```
result: `'irc-connect-ctcp:SomeApp v4.2:NodeJS=0.10.30+(V8=3.14.5.9)'`

Set `'versionRaw'` with a string and it will take you literally *(RFC be darned!)*
> *__NOTE__: if you set this to `''` it will still respond, with empty params*
```node
client.ctcpSetOption('versionRaw','SomeApp v4.2')
```
result: `'SomeApp v4.2'`

#### `CTCP TIME` responder
Default response is the current date/time formatted like
> `Tue Aug 19 13:22:02 2014 -0600`

##### *__THESE SETTINGS ARE PRELIMINARY AND ARE NOT IN THE CODE YET__*

~~Set `'timeSkew'` with an offset in seconds to adjust the advertised time.~~
> ~~`client.ctcpSetOption('timeSkew',3600)`~~

> ~~`CTCP TIME` response will be current date minus one hour~~

~~Set `'time'` with a `Date` to force the response to then and not the current time.~~
> ~~`client.ctcpSetOption('time',new Date('Mon, 5 Nov 1955 02:20:00 -0800'))`~~

> ~~`CTCP TIME` response: `Tue Nov 5 04:20:00 1955 -0600` no matter what time it really is,
although note it is in your default timezone regardless the zone on what you set~~

#### `CTCP PING` responder
Default response is whatever the other end sent us (usually a timestamp number) and then
whatever their current time on reception of the response minus the reflected stamp, yields
a reasonable idea of latency.

##### *__THE FOLLOWING SETTINGS ARE PRELIMINARY AND ARE NOT IN THE CODE YET__*
~~As there are really no settables for this service, only the disable works, via `'ping'`~~
> ~~`client.ctcpSetOption('ping',false)`~~

> ~~`CTCP PING` will no longer respond at all~~

### Events
This plugin emits the events
`'ctcp_request'`
and
`'ctcp_response'`
on incoming `CTCP` messages.  Consume them as usual:
> ```node
client.on('ctcp_request',function(event){...})
client.on('ctcp_response',function(event){...})
```
Where `orig` is the original `'PRIVMSG'` or `'NOTICE'` `event`...

> member | content
------:|:-------
`event.type` | from `orig.params[0]` (ex: `'DCC'`, `'FINGER'`, `'VERSION'`)
`event.params` | from `orig.params[1..n]` (ex: `['SEND','Funny.mp3','12945673','7654','54321']`, `[]`)
`event.message` | raw message, unsplit into params (in case you want to use your own encoding)

### Methods
#### `client.isCtcp(event)`
Event test for `CTCP` formatted params.  Returns `true` or `false` based on detection of
a `CTCP` formatted message in the `event`.

This is of use in any `PRIVMSG` or `NOTICE` event handlers, as they will still propagate,
showing up with params wrapped in ``\u0001`` characters. So, to solve this, use this to
bail out of your handler and skip anything that will have already emitted a `ctcp_request`
or `ctcp_response`.
Such as:
> ```node
  client.on('PRIVMSG',
    function(event){
      if(client.isCtcp(event)) return;
      //... process PRIVMSG as normal ... 
    }
  )
```

Formatting methods which proxy to `client.send()`:
#### `client.ctcpRequestSend(target, type, params)`
sends a `CTCP`-encoded `PRIVMSG`
#### `client.ctcpResponseSend(target, type, params)`
sends a `CTCP`-encoded `NOTICE`

Usage is the same as main `irc-connect` methods, add your listener and then send off the request.

You could use `client.once()` to connect the listener, however if any other `ctcp_response` comes in out-of-order it will unbind the listener even though it wasn't a matching event.  So, the example below shows a method for handling the `.once()` style manually.

With a little more you can add a `setTimeout()` to unbind your listener which is decent practice, if not best practice. Usually the target will respond within a second, or won't respond at all.
> ```node
var target = 'someNickName'
var type   = 'VERSION'
var resHandler = function(event){
  //this is our fire escape (not the response we want)
  if((target !== event.nick) || type !== event.nick)) return
  //disconnect the emitter (this function, omg wormholes!)
  client.removeListener('ctcp_response',resHandler)
  //do whatever, in this case just bark the message to the console
  console.log('someNickName is using ' + event.message)
}
client.on('ctcp_response',resHandler)
//string literals used for better illustration
//could have just passed target/type vars
client.ctcpRequestSend('someNickName','VERSION')
```

## DCC Plugin [`client.use(ircCtcp.dcc)`]
You need to `client.use(ircCtcp)` before this, it won't load by itself as it needs
the CTCP `ctcp_request` event and the above two methods.
### Setup and configurables
Access internal plugin options using methods
`client.dccSetOption(key, value)`
and
`client.dccGetOption(key)`

All settings are optional, there is a default provided for each one.

#### Banner support for new `DCC CHAT` connections
Default is `'DCC CHAT ready'`

Set `'banner'` with a string to auto-respond on the opening of a DCC CHAT.  Include `'\n'` for
multiple line support.  A trailing `'\n'` is assumed, do not include one (it gets trimmed anyway!).
You can also set this to `false` to disable any outgoing greeting.
> `client.dccSetOption('banner','Welcome to DCC CHAT!\nPlease type back at me.')`
Future `DCC CHAT` connections will receive:

> ```
Welcome to DCC CHAT!
Please type back at me.
```

#### File placement for incoming `DCC SEND` requests
Default is whatever `'os.tmpdir()'` says on your system

Set `'targetPath'` with a string to the place you'd like DCC SEND to put files.
> ~~`client.dccSetOption('targetPath','/some/place/safe')`~~

> ~~Future `DCC SEND` requests will have for example `'/some/place/safe/Funny.mp3'` in `event.filename`~~

### Events
This plugin consumes a `'ctcp_request'` event, and emits events based on `event.type` (chat or send).
It assigns a "handle" (random string) to each new session request, use this handle to identify the
session to various methods.  Other DCC methods are not supported.

#### Events from `'CHAT'` type requests
##### `client.on('ctcp_dcc_chat_request',function(event){...})`
A new `CTCP DCC CHAT` request has been received.
> Where `orig` is the original `'ctcp_request'` `event`...

> member | content
------:|:-------
`event.type` | from `orig.params[0]` always `'CHAT'`
`event.argument` | from `orig.params[1]` generally always`'chat'` (ignored internally)
`event.address` | from `orig.params[2]` target IP, converted from integer (ex: `'127.3.2.1'`)
`event.port` | from `orig.params[3]` target port, as number (ex: `4273`)
`event.handle` | randomly assigned internally, as a reference string/tag to this DCC request (ex: `'Z1LD02EWM'`)
Call the `client.dccRequestAccept(handle)` method with the `event.handle` to confirm the connection.

In the rest of the events, `event` format is the same as the `'ctcp_dcc_chat_request'` event, as the
entire structure is emitted from the sessions for every specific event, with possible additions.

##### `client.on('ctcp_dcc_chat_error',function(event){...})`
> There has been an error, reason is in `event.message`.  The rest of the session is not
included on this event.

##### `client.on('ctcp_dcc_chat_connecting',function(event){...})`
> The socket is connecting.

##### `client.on('ctcp_dcc_chat_connect',function(event){...})`
> The socket has connected successfully.

##### `client.on('ctcp_dcc_chat_message',function(event){...})`
> The remote side sent a line, which is in `event.message`.

##### `client.on('ctcp_dcc_chat_close',function(event){...})`
> The socket has closed.  This can be either on purpose (other end closed the chat) or may be
emitted alongside a `'ctcp_dcc_chat_error'` event.

#### Events from `'SEND'` type requests
##### `client.on('ctcp_dcc_send_request',function(event){...})`
A new `CTCP DCC SEND` request has been received.
> Where `orig` is the original `'ctcp_request'` `event`...

> member | content
------:|:-------
`event.type` | from `orig.params[0]` always `'SEND'`
`event.argument` | from `orig.params[1]` the source basename (ex: `'Funny.mp3'`)
`event.address` | from `orig.params[2]` target IP, converted from integer (ex: `'127.3.2.1'`)
`event.port` | from `orig.params[3]` target port, as number (ex: `4273`)
`event.size` | [optional] from `orig.params[4]` file size, as number (ex: `1048576`)
`event.filename` | generated local target with full path (ex: `'/home/lolcats/Documents/Funny.mp3'` or `'C:\\Users\\LOLcats\\Documents\\Funny.mp3'`)
`event.wrote` | how many bytes have been received/written so far, always `0` on the request event
`event.handle` | randomly assigned internally, as a reference string/tag to this DCC request (ex: `'byBfoSG'`)
Call the `client.dccRequestAccept(handle)` method with the `event.handle` to confirm the connection.

In the rest of the events, `event` format is the same as the `'ctcp_dcc_send_request'` event, as the
entire structure is emitted from the sessions for every specific event, with possible additions.

##### `client.on('ctcp_dcc_send_error',function(event){...})`
> There has been an error, reason is in `event.message`.

##### `client.on('ctcp_dcc_send_open',function(event){...})`
> The destination file (`event.filename`) has been successfully created for writing.

##### `client.on('ctcp_dcc_send_connecting',function(event){...})`
> The socket is connecting.

##### `client.on('ctcp_dcc_send_connect',function(event){...})`
> The socket has connected successfully.

##### `client.on('ctcp_dcc_send_progress',function(event){...})`
> Progress reports are sent every second on a timer, basically a snapshot of the session.
Therefore `event.wrote` should be rising each time.  Use `event.size` if provided, to figure out and
display progress or speed/completion estimations.  There will always be at least one of these emitted.
Also there is usually a single one emitted **after** the `'ctcp_dcc_send_close'` because the file
flushes and closes slightly slower than the socket.

##### `client.on('ctcp_dcc_send_close',function(event){...})`
> The socket and file have closed.  This can be either on purpose (other end closed the chat) or may be
emitted alongside a `'ctcp_dcc_send_error'` event.
If `event.wrote` does not equal `event.size` (if given) then something failed.  Nobody knows what,
there are no checksums (and sometimes not even expected size!) in this protocol.  Hopefully there was
some sort of `'ctcp_dcc_send_error'` event as a clue, but sometimes not (such as other side cancelled
the send).  Some clients will send you a `'NOTICE'` event to tell you what happened, others don't.

### Methods
#### `client.dccRequestAccept(handle)`
Signal that the connection session (referenced by `'event.handle'`) should be accepted.
If you do not want to connect just don't call this in the `'ctcp_dcc_*_request'` handler.

#### `client.dccChatWrite(handle,message)`
Send `message` as a line (auto-appends the newline) to the `DCC CHAT` session identified by `handle`.
If the session does not exist it will return `false`.

##### *__THE FOLLOWING METHODS ARE PRELIMINARY AND ARE NOT IN THE CODE YET__*
#### ~~`client.dccChatRequest(target)`~~
#### ~~`client.dccSendRequest(target,filename)`~~
~~Both of these initiate an outgoing `DCC CHAT` or `DCC SEND` request to the nick provided in `target`.~~
~~The IP used is autoselected based on the one the IRC server says we have (which should bypass~~
~~NAT issues), and port is randomly selected by the system as port `0` is given to the listener.~~
