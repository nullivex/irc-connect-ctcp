'use strict';
var debug = require('debug')('irc:ctcp:dcc')
var fs = require('fs')
var ip = require('ip')
var net = require('net')
var path = require('path')
var shortId = require('shortid')

var generateHandle = function(){return shortId.generate().replace(/[-_]/g,'')}



/**
 * Plugin constructor, contain reference to client
 * @param {Irc} irc Reference to Irc helper object
 * @constructor
 */
var CtcpDcc = function(irc){
  var that = this
  that.conn = irc
  that.options = {banner:'DCC CHAT ready'}
}


/**
 * Get DCC Type
 * @param {object} event Event from CTCP plugin event
 * @return {string|boolean} Type, or false if not DCC
 */
CtcpDcc.prototype.getDccType = function(event){
  return ('DCC' === event.type) ? event.params[0].toUpperCase() : false
}


/**
 * Register plugin and return self-reference
 * @return {CtcpDcc}
 */
CtcpDcc.prototype.register = function(){
  var that = this
  if(!that.irc.conn.ctcp){
    debug('irc-connect CTCP plugin not loaded, bailing')
    return false
  }
  that.irc.conn.on('ctcp_request',function(event){
    var type = that.getDccType(event)
    //bail on non-DCC or unhandled types
    if(!type || -1 === ['CHAT','SEND'].indexOf(type)) return
    var handle = generateHandle()
    var argument = event.params[1]
    var address = ip.fromLong(event.params[2])
    var port = +event.params[3]
    var size = +event.params[4]
    var _recvFile = null
    var params = {
      type: type,
      argument: argument,
      address: address,
      port: port
    }
    if('SEND' === type && size) params.size = +size
    that.irc.conn.emit('ctcp_dcc_request',{
      nick: event.nick,
      user: event.user,
      host: event.host,
      command: 'CTCP_DCC_REQUEST',
      type: type,
      handle: handle,
      params: params
    })
    debug('Connecting to ' + [address,port].join(':'))
    var dccSocket = net.connect(port,address,function(){
        debug('Connected')
        dccSocket.on('error',function(err){
          debug('ERROR:',err)
          that.irc.conn.emit('ctcp_dcc_error',{nick:event.nick,handle:handle,message:err})
        })
        dccSocket.on('end',function(){
          debug('Connection closed')
          that.irc.conn.emit('ctcp_dcc_closed',{nick:event.nick,handle:handle})
        })
        switch(type){
        case 'CHAT':
          dccSocket.on('data',function(data){
            var rv = {nick:event.nick,handle:handle,message:data.toString().trim()}
            debug('emit ctcp_dcc_chat:',rv)
            that.irc.conn.emit('ctcp_dcc_chat',rv)
          })
          if(that.options.banner) dccSocket.write(that.options.banner + '\n')
          break
        case 'SEND':
          var fname = [fs.realpathSync('./'),argument].join(path.sep)
          if(fs.existsSync(fname)){
            debug('File Exists (' + fname + ')')
            dccSocket.end()
          }
          else{
            _recvFile = fs.createWriteStream(fname)
            _recvFile.on('open',function(){
              debug('Saving to file ' + fname)
              dccSocket.on('end',function(){
                _recvFile.end(function(){
                  debug('Saved ' + _recvFile.bytesWritten + ' bytes to ' + fname +
                    ((size === _recvFile.bytesWritten) ? ' [size good!]' : ' [size BAD should be ' + size + ']'))
                })
              })
              dccSocket.on('data',function(data){
                dccSocket.pause()
                if(_recvFile){
                  _recvFile.write(data,function(){
                    var bytesWritten = _recvFile.bytesWritten
                    var buf = new Buffer([0,0,0,0])
                    buf.writeUInt32BE(bytesWritten,0)
                    dccSocket.write(buf,function(){
                      dccSocket.resume()
                    })
                  })
                }
              })
            })
          }
          break
        default:
          debug('Unknown CTCP DCC type:',type)
          break
        }
      })
  })
  debug('Plugin registered')
  return that
}


/**
 * Export plugin
 * @type {CtcpDcc}
 */
module.exports = CtcpDcc
