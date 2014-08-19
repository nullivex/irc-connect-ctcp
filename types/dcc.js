'use strict';
var debug = require('debug')('irc:ctcp:dcc')
var fs = require('fs')
var ip = require('ip')
var net = require('net')
var merge = require('merge-recursive')
var os = require('os')
var path = require('path')
var shortId = require('shortid')

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'')}
var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}



/**
 * Plugin constructor, contain reference to client
 * @param {object} client Reference to irc-connect client object
 * @constructor
 */
var TypeDcc = function(client){
  if(!client.ctcp){
    debug('irc-connect-ctcp plugin not loaded, bailing')
    return false
  }
  //safety check complete
  var that = this
  that.client = client
  that.options = {banner:'DCC CHAT ready'}
  that.sessions = {}
  that.sockets = {}
  return that
}


/**
 * Event receiver for ctcp_request events
 * @param {object} event Event from irc-connect-ctcp
 * @return {void} fire escape
 */
TypeDcc.prototype.recvRequest = function(event){
  var that = this
  var type = that.getDccType(event)
  //bail on non-DCC or unhandled types
  if(!type || -1 === ['CHAT','SEND'].indexOf(type)) return
  var handle = generateHandle()
  that.sessions[handle] = {
    nick: event.nick,
    user: event.user,
    host: event.host,
    type: type,
    argument: event.params[1],
    address: ip.fromLong(event.params[2]),
    port: +event.params[3]
  }
  if('SEND' === type){
    that.sessions[handle].filename = [os.tmpdir(),that.sessions[handle].argument].join(path.sep)
    if(-1 < event.params[4]){
      that.sessions[handle].size = +event.params[4]
      that.sessions[handle].wrote = 0
    }
  }
  that.emit('request',handle)
}


/**
 * Get DCC Type
 * @param {object} event Event from CTCP plugin event
 * @return {string|boolean} Type, or false if not DCC
 */
TypeDcc.prototype.getDccType = function(event){
  return ('DCC' === event.type) ? event.params[0].toUpperCase() : false
}


/**
 * Emit a message wrapped with standard stuff
 * @param {string} what Emit subject ('request', 'error', 'status', etc)
 * @param {string} handle Session handle
 * @param {object} append Things to add into the session object before emitting
 */
TypeDcc.prototype.emit = function(what,handle,append){
  var that = this
  var s = propCopy(that.sessions[handle])
  var add = {handle:handle}
  if('error' === what && 'string' === typeof append) add.message = append
  if('object' !== typeof append) append = {}
  var rv = merge(s,add,append)
  var e = ['ctcp_dcc',s.type.toLowerCase(),what].join('_')
  debug(['emitting',e,JSON.stringify(rv)].join(' '))
  that.client.emit(e,rv)
}


/**
 * Send a DCC CHAT message to an established Session handle
 * @param {string} handle Session handle
 * @param {string} message Message to send
 */
TypeDcc.prototype.sendChat = function(handle,message){
  var that = this
  that.sockets[handle].write(message + '\n')
}


/**
 * Accept an incoming request (userspace does this in response to the initial ctcp_dcc_request event)
 * @param {string} handle Session handle
 * @return {void} fire escape
 */
TypeDcc.prototype.acceptRequest = function(handle){
  var that = this
  if(!that.sessions[handle]) return
  var s = propCopy(that.sessions[handle])
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
      debug('ERROR:',err)
      that.emit('error',handle,{message:err})
    })
    dccSocket.on('end',function(){
      debug('Connection closed')
      that.emit('close',handle)
    })
  })
  switch(s.type){
  case 'CHAT':
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
          that.sessions[handle].wrote = _recvFile.bytesWritten
          that.emit('progress',handle)
          var success = (s.size === that.sessions[handle].wrote)
          debug('Saved ' + that.sessions[handle].wrote + ' bytes to ' + s.filename +
            (success ? ' [size good!]' : ' [size BAD should be ' + s.size + ']'))
          that.emit('complete',handle,{success: success})
        })
      })
      dccSocket.on('data',function(data){
        dccSocket.pause()
        _recvFile.write(data,function(){
          that.sessions[handle].wrote = _recvFile.bytesWritten
          var buf = new Buffer([0,0,0,0])
          buf.writeUInt32BE(that.sessions[handle].wrote,0)
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
    var dcc = new TypeDcc(client)
    if(!dcc) return
    client.ctcp.dcc = dcc
    //client function bindery
    client.acceptDccRequest = dcc.acceptRequest.bind(dcc)
    client.sendDccChat = dcc.sendChat.bind(dcc)
    //client event hooks
    client
      .on('ctcp_request',dcc.recvRequest.bind(dcc))
    debug('Plugin registered')
  }
}
