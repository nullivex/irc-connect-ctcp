'use strict';
var debug = require('debug')('irc:ctcp:dcc')
var fs = require('fs')
var ip = require('ip')
var net = require('net')
var merge = require('merge-recursive')
var os = require('os')
var path = require('path')
var shortId = require('shortid')



/**
 * Plugin constructor
 * @constructor
 */
var Dcc = function(){
  var that = this
  that.options = {
    banner:'DCC CHAT ready',
    targetPath: os.tmpdir()
  }
  that.sessionTimeout = {}
  that.sessions = {}
  that.sockets = {}
  return that
}



/**
 * Clone a session and keep object properties in order
 * @param {object} session Source session entry
 * @constructor
 */
Dcc.prototype.Session = function(session){
  var that = this
  var sessionPropOrder = [
    'handle','nick','user','host','command',
    'type','target','argument','address','port'
  ]
  var sendProps = ['filename','size','wrote']
  var setProp = function(prop){
    that[prop] = (session.hasOwnProperty(prop)) ? session[prop] : null
  }
  sessionPropOrder.forEach(setProp)
  if('SEND' === session.type){
    sendProps.forEach(setProp)
  }
}


/**
 * Get an option
 * @param {string} option Option
 * @return {*} Value (no filter, could return undefined, null, whatever)
 */
Dcc.prototype.getOption = function(option){
  var that = this
  var value = that.options[option]
  debug('getting options[\''+option+'\'] which is currently ' + value)
  return value
}


/**
 * Set an option
 * @param {string} option Option
 * @param {*} value Value
 */
Dcc.prototype.setOption = function(option,value){
  var that = this
  debug('setting options[\''+option+'\'] = ' + value)
  that.options[option] = value
}


/**
 * Detect DCC Type
 * @param {object} event Event from CTCP plugin event
 * @return {string|boolean} Type, or false if not DCC
 */
Dcc.prototype.typeDetect = function(event){
  return ('DCC' === event.type) ? event.params[0].toUpperCase() : false
}


/**
 * Event receiver for ctcp_request events
 * @param {object} event Event from irc-connect-ctcp
 * @return {void} fire escape
 */
Dcc.prototype.requestRecv = function(event){
  var that = this
  var type = that.typeDetect(event)
  //bail on non-DCC or unhandled types
  if(!type || -1 === ['CHAT','SEND'].indexOf(type)) return
  var handle = shortId.generate().replace(/[-_]/g,'')
  var sess = new that.Session(event)
  sess.type= type
  sess.argument = event.params[1]
  sess.address = ip.fromLong(event.params[2])
  sess.port = +event.params[3]
  if('SEND' === type){
    sess.filename = [that.options.targetPath,sess.argument].join(path.sep)
    if(-1 < event.params[4]){
      sess.size = +event.params[4]
      sess.wrote = 0
    }
  }
  that.sessions[handle] = sess
  that.emit('request',handle)
  //set the session expiration in case it is never accepted (60 seconds)
  that.sessionTimeout[handle] = setTimeout(function(){
    debug('Session ' + handle + ' timed out')
    that.emit('error',handle,{message:'TimedOut'})
    that.clearSession(handle)
  },60000)
}


/**
 * Send a DCC CHAT Request
 * @param {string} target Target
 * @return {void} fire escape
 */
Dcc.prototype.chatRequest = function(target){
  if(!target) return
  var that = this
  that.ctcpRequestSend(target,'DCC',['CHAT','chat',ip.toLong('127.6.6.6'),'1666'])
}


/**
 * Send a DCC CHAT message to an established Session handle
 * @param {string} handle Session handle
 * @param {string} message Message to send
 */
Dcc.prototype.chatWrite = function(handle,message){
  var that = this
  that.sockets[handle].write(message + '\n')
}


/**
 * Send a DCC SEND Request
 * @param {string} target Target
 * @param {string} filename Filename to send
 * @return {void} fire escape
 */
Dcc.prototype.sendRequest = function(target,filename){
  if(!(target && filename && fs.fileExistsSync(filename))) return
  var size = (fs.statSync(filename).size)
  if(!size) return
  var that = this
  that.ctcpRequestSend(target,'DCC',['SEND',path.basename(filename),ip.toLong('127.6.6.6'),'1666',size])
}


/**
 * Emit a message wrapped with standard stuff
 * @param {string} what Emit subject ('request', 'error', 'status', etc)
 * @param {string} handle Session handle
 * @param {object} append Things to add into the session object before emitting
 */
Dcc.prototype.emit = function(what,handle,append){
  var that = this
  var s = new that.Session(that.sessions[handle])
  var add = {handle:handle}
  if('error' === what && 'string' === typeof append) add.message = append
  if('object' !== typeof append) append = {}
  var rv = merge(s,add,append)
  var e = ['ctcp_dcc',s.type.toLowerCase(),what].join('_')
  debug(['emitting',e,JSON.stringify(rv)].join(' '))
  that.clientEmit(e,rv)
}


/**
 * Clear a session (and socket)
 * @param {string} handle Session handle
 */
Dcc.prototype.clearSession = function(handle){
  var that = this
  //kill the timeout, if any
  if(that.sessionTimeout[handle]) clearTimeout(that.sessionTimeout[handle])
  //this uses a 1 second timeout because streams can be flushing still
  //so we don't want to destroy these too soon
  setTimeout(function(){
    var cleared = (that.sessionTimeout[handle] || that.sessions[handle] || that.sockets[handle])
    if(that.sessionTimeout[handle]) delete(that.sessions[handle])
    if(that.sessions[handle]) delete(that.sessions[handle])
    if(that.sockets[handle]) delete(that.sockets[handle])
    if(cleared) debug('Cleared session ' + handle)
  },1000)
}


/**
 * Accept an incoming request (userspace does this in response to the initial ctcp_dcc_request event)
 * @param {string} handle Session handle
 * @return {void} fire escape
 */
Dcc.prototype.requestAccept = function(handle){
  var that = this
  var sess = that.sessions[handle]
  if(!sess) return
  clearTimeout(that.sessionTimeout[handle])
  var s = new that.Session(sess)
  var debug = require('debug')(['irc:ctcp:dcc',s.type.toLowerCase(),handle].join(':'))
  var _recvFile = null
  if('SEND' === s.type && s.filename){
    if(fs.existsSync(s.filename)){
      debug('File Exists (' + s.filename + ')')
      that.emit('error',handle,'FileExists')
      return
    }
    _recvFile = fs.createWriteStream(s.filename)
  }
  debug('Connecting to ' + [s.address,s.port].join(':'))
  that.emit('connecting',handle)
  var dccSocket = that.sockets[handle] = net.connect(s.port,s.address,function(){
    debug('Connected')
    that.emit('connect',handle)
    dccSocket.on('error',function(err){
      debug('Connection ERROR:',err)
      that.emit('error',handle,{message:err})
      that.clearSession(handle)
    })
    dccSocket.on('end',function(){
      debug('Connection closed')
      that.emit('close',handle)
    })
  })
  switch(s.type){
  case 'CHAT':
    dccSocket.on('end',function(){ that.clearSession(handle) })
    dccSocket.on('data',function(data){
      that.emit('message',handle,{message:data.toString().trim()})
    })
    if(that.options.banner) dccSocket.write(that.options.banner + '\n')
    break
  case 'SEND':
    _recvFile.on('open',function(){
      debug('Saving to file ' + s.filename)
      that.emit('open',handle)
      var reporter
      var report = function(){
        that.emit('progress',handle)
        reporter = setTimeout(report,1000)
      }
      reporter = setTimeout(report,1000)
      dccSocket.on('end',function(){
        _recvFile.end(function(){
          clearTimeout(reporter)
          sess.wrote = _recvFile.bytesWritten
          that.emit('progress',handle)
          var success = s.size ? (s.size === sess.wrote) : true
          debug('Saved ' + sess.wrote + ' bytes to ' + s.filename +
            (success ? ' [seems legit!]' : ' [size BAD should be ' + s.size + ']'))
          that.emit('complete',handle,{success: success})
          that.clearSession(handle)
        })
      })
      dccSocket.on('data',function(data){
        dccSocket.pause()
        _recvFile.write(data,function(){
          sess.wrote = _recvFile.bytesWritten
          var buf = new Buffer([0,0,0,0])
          buf.writeUInt32BE(sess.wrote,0)
          dccSocket.write(buf,function(){
            dccSocket.resume()
          })
        })
      })
    })
    break
  default:
    debug('Unknown CTCP DCC type:',s.type)
    break
  }
}


/**
 * Export plugin
 * @type {object}
 * @return {void} fire escape
 */
module.exports = {
  __irc: function(client){
    if(!client.isCtcp){
      debug('irc-connect-ctcp plugin not loaded, bailing')
      return false
    }
    //safety check complete
    var dcc = new Dcc()
    //bind upper emit/send
    dcc.clientEmit = client.emit.bind(client)
    dcc.clientSend = client.send.bind(client)
    //no need to double rebind these
    dcc.ctcpRequestSend = client.ctcpRequestSend
    dcc.ctcpResponseSend = client.ctcpResponseSend
    //client function bindery
    client.dccSetOption = dcc.setOption.bind(dcc)
    client.dccGetOption = dcc.getOption.bind(dcc)
    client.dccRequestAccept = dcc.requestAccept.bind(dcc)
    client.dccChatWrite = dcc.chatWrite.bind(dcc)
    client.dccChatRequest = dcc.chatRequest.bind(dcc)
    client.dccSendRequest = dcc.sendRequest.bind(dcc)
    //client event hooks
    client
      .on('ctcp_request',dcc.requestRecv.bind(dcc))
    debug('Plugin registered')
  }
}
