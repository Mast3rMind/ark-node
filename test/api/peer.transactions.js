'use strict'; /*jslint mocha:true, expr:true */

var crypto = require('crypto');
var node = require('./../node.js');

var genesisblock = require('../genesisBlock.json');

function postTransaction (transaction, done) {
	node.post('/peer/transactions', {
		transactions: [transaction]
	}, done);
}

function getAddress (address, done) {
	node.get('/api/accounts?address=' + address, done);
}

describe('GET /peer/transactions', function () {

	it('using vendorField should be ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, "this is a test vendorfield", node.gAccount.password);
		console.log(transaction);
		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
			done();
		});
	});

	it('using incorrect nethash in headers should fail', function (done) {
		node.get('/peer/transactions')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using valid headers should be ok', function (done) {
		node.get('/peer/transactions')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.ok;
				node.expect(res.body).to.have.property('transactions').to.be.an('array');
				done();
			});
	});
});

describe('POST /peer/transactions', function () {

	it('using incorrect nethash in headers should fail', function (done) {
		node.post('/peer/transactions')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using valid headers should be ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
			done();
		});
	});

	it('using already processed transaction should be not ok (preventing spam)', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 2, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			postTransaction(transaction, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				done();
			});
		});
	});

	it('using already confirmed transaction should be not ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 3, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			node.onNewBlock(function (err) {
				postTransaction(transaction, function (err, res) {
					console.log(res.body);
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});
		});
	});


	it('using transaction with undefined recipientId should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction(undefined, 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using transaction with negative amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', -1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using invalid passphrase should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, node.gAccount.password);
		transaction.id = node.ark.crypto.getId(transaction);
		transaction.recipientId = '1A';

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('when sender has no funds should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, 'randomstring');

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ARK: [a-zA-Z0-9]+ balance: 0/);
			done();
		});
	});

	it('when sender does not have enough funds should always fail', function (done) {
		var account = node.randomAccount();
		var transaction = node.ark.transaction.createTransaction(account.address, 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			node.onNewBlock(function () {
				var count = 1;
				var transaction2 = node.ark.transaction.createTransaction(node.gAccount.address, 2, null, account.password);

				node.async.doUntil(function (next) {
					postTransaction(transaction2, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.not.ok;
						node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ARK: [a-zA-Z0-9]+ balance: 1e-8/);
						count++;
						return next();
					});
				}, function () {
					return count === 10;
				}, function () {
					return done();
				});
			});
		});
	});

	it('using fake signature should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, node.gAccount.password);
		transaction.signature = crypto.randomBytes(64).toString('hex');
		transaction.id = node.ark.crypto.getId(transaction);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using invalid publicKey should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, node.gAccount.password);
		transaction.senderPublicKey = node.randomPassword();
		node.debug('> Tx:'.grey, JSON.stringify(transaction));
		postTransaction(transaction, function (err, res) {
			node.debug('> Response:'.grey, JSON.stringify(res.body));
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			//node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using invalid signature should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1, null, node.gAccount.password);
		transaction.signature = node.randomPassword();

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			//node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using very large amount and genesis block id should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 100000000000000000, null, node.gAccount.password);
		transaction.blockId = genesisblock.id;

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			//node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using overflown amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 184819291270000000012910218291201281920128129, null,
		node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using float amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('AacRfTLtxAkR3Mind1XdPCddj1uDkHtwzD', 1.3, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

});
