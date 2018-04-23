Array.prototype.random = function () {
  return this[Math.floor((Math.random() * this.length))];
}

const range = x => Array.from(Array(x).keys());

// constants
keyDefs = {
    "37": "left",
    "38": "up",
    "39": "right",
    "40": "down",
    "32": "space"
};
time_step = 150;
canvas_size = 800;
canvas_offset_x = 50;
canvas_offset_y = 90;
block_size = 18;
block_shade_offset = 0.25;
field_width = 20;
inner_field_width = field_width - 2;
field_height = 30;

$(document).ready(function() {
    const input = $('body');
    const canvas = document.getElementById("canvas");
  
    const ctx = canvas.getContext("2d");
    const replicaSize = 5;

    // arrange replicas in a circle
    const circleRadius = 200;
    const replicas = Immutable.Range(0, replicaSize).map(i => {
      var x = 250 + circleRadius * Math.cos(- Math.PI / 2 + 2 * Math.PI * i / replicaSize);
      var y = 250 + circleRadius * Math.sin(- Math.PI / 2 + 2 * Math.PI * i / replicaSize);
      return new Replica(i, x, y);
    }).toList();

    // construct links between replica pairs
    const links = Immutable.Range(0, replicaSize).flatMap(src_idx => {
      return Immutable.Range(0, replicaSize).map(dest_idx => {
        if (src_idx == dest_idx) return null;
        else {
          const src_replica = replicas.get(src_idx);
          const dest_replica = replicas.get(dest_idx);
          const link = new Link(src_replica, dest_replica);
          src_replica.addLink(dest_idx, link);
          return link;
        }
      }).filter(link => link != null);
    }).toList();
    
    // start draw loop
    setInterval(() => {
      ctx.save();
      ctx.fillStyle = "#EAECEE";
      ctx.fillRect(0, 0, 600, 600);
      ctx.restore();

      links.forEach(link => link.draw(ctx));
      replicas.forEach(replica => replica.draw(ctx));
    }, 100);
});

class Packet {
  constructor(data) {
    this.data = data;
  }  
}

class Deliverable {
  constructor(packet) {
    this.packet = packet;
    this.progress = 0;
  }
}

class Link {
  constructor(src, dest) {
    // state properties
    this.src = src;
    this.dest = dest;
    this.deliverables = Immutable.List();
    this.speed = 0.1;

    // set infinite loop for the link 
    setInterval(this.execute.bind(this), 100);
  }

  draw(ctx) {
    ctx.save();

    ctx.strokeStyle = "black";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(this.src.x, this.src.y);
    ctx.lineTo(this.dest.x, this.dest.y);
    ctx.stroke();

    this.deliverables.forEach(d => {
      console.log("here")
      ctx.beginPath();
      ctx.arc(
        this.src.x + d.progress * (this.dest.x - this.src.x),
        this.src.y + d.progress * (this.dest.y - this.src.y), 4, 0, Math.PI * 2, false);
      ctx.fill();
    });

    ctx.restore();
  }

  execute() {
    this.deliverables.forEach(d => d.progress += this.speed);
    const done = this.deliverables.filter(d => d.progress >= 1);
    const still = this.deliverables.filter(d => d.progress < 1);

    this.deliverables = still;
    done.forEach(d => {
      this.dest.queue = this.dest.queue.push(d.packet);
    });
  }

  deliver(packet) {
    const deliverable = new Deliverable(packet);
    this.deliverables = this.deliverables.push(deliverable);
  }
}

class Replica {
  constructor(name, x, y) {
    // visual properties
    this.name = name;
    this.x = x;
    this.y = y;

    // state properties
    this.counter = 0;
    this.color = "yellow";
    this.links = Immutable.Map();
    this.queue = Immutable.List();

    // set infinite loop for the replica 
    setInterval(this.execute.bind(this), 100);
  }

  addLink(replica_idx, link) {
    this.links[replica_idx] = link;
  }

  sendPacket(address, data) {
    this.links[address].deliver(new Packet(data));
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10, 0, Math.PI * 2, false);
    ctx.fill();

    var queueIndex = 20;
    this.queue.forEach(p => {
      ctx.save();
      ctx.fillStyle = "blue";
      ctx.fillText(p.data, this.x, this.y + queueIndex);
      queueIndex += 10;
      ctx.restore();
    });

    ctx.fillStyle = "black";
    ctx.fillText(this.name, this.x - 4, this.y + 3);

    ctx.restore();
  }

  execute() {
    if (this.counter % 10 == 0) {
      if (this.color === "yellow") this.color = "red";
      else this.color = "yellow";
    }

    if (this.name == 0 && this.counter % 20 == 0) {
      this.sendPacket(1, "ahmed");
    }

    this.counter++;
  }
}