class ContourMicrophone extends AudioWorkletProcessor {
  buffer = new Float32Array(1024);
  used = 0;

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    this.buffer.set(channel, this.used);
    this.used += channel.length;
    if (this.used === this.buffer.length) {
      this.port.postMessage(this.buffer, [this.buffer.buffer]);
      this.buffer = new Float32Array(1024);
      this.used = 0;
    }
    return true;
  }
}

registerProcessor('contour-microphone', ContourMicrophone);
