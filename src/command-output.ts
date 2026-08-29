export interface CommandOutputStream {
  write(
    chunk: string,
    callback: (error?: Error | null) => void,
  ): boolean;
}

export function writeCommandOutput(
  stream: CommandOutputStream,
  output: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(output, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
