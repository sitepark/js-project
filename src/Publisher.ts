export interface Publisher {
  publish(): Promise<void>;

  cleanup(): Promise<void>;
}
