class Network {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.peerId = null;
    this.onData = null;
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
  }

  host() {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.isHost = true;

      this.peer.on('open', (id) => {
        this.peerId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this._setupConnection();
      });

      this.peer.on('error', (err) => {
        if (this.onError) this.onError(err);
        reject(err);
      });
    });
  }

  join(targetId) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', () => {
        this.conn = this.peer.connect(targetId);
        this.isHost = false;
        this._setupConnection();
        resolve();
      });

      this.peer.on('error', (err) => {
        if (this.onError) this.onError(err);
        reject(err);
      });
    });
  }

  _setupConnection() {
    this.conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });

    this.conn.on('open', () => {
      if (this.onOpen) this.onOpen();
    });

    this.conn.on('close', () => {
      if (this.onClose) this.onClose();
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  disconnect() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
