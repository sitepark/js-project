import type { Publisher } from "./Publisher";

export class MultiPublisher implements Publisher {
  public constructor(private readonly publishers: Publisher[]) {}

  async publish(): Promise<void> {
    for (const publisher of this.publishers) {
      await publisher.publish();
    }
  }

  async cleanup(): Promise<void> {
    for (const publisher of this.publishers) {
      await publisher.cleanup();
    }
  }
}
