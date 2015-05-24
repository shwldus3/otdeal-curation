// 몽고디비 연결 담당
var mongoose = require('mongoose');
var uri = 'mongodb://localhost/otdeal';
var options = {
	server: { poolSize : 100 }
};

var db = mongoose.createConnection(uri, options);

//에러 났을 때 처리하는 부분
db.on('error', function(err){
	if(err) throw err;
});

//정상 연결 됬을 때 처리하는 부분
db.once('open', function(){
	console.info('MongoDB connected successfully');
});

module.exports = db;