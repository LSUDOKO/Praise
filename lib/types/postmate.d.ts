declare module "postmate" {
  export class Model {
    constructor(options: any);
    emit(event: string, data?: any): void;
  }

  export class ParentAPI {
    frame: HTMLIFrameElement;
    on(event: string, callback: (data: any) => void): void;
    call(method: string, data?: any): void;
  }

  interface PostmateOptions {
    container: HTMLElement;
    url: string;
    name?: string;
    classList?: string[];
  }

  const Postmate: {
    Model: typeof Model;
    new (options: PostmateOptions): Promise<ParentAPI>;
    (options: PostmateOptions): Promise<ParentAPI>;
  };

  export default Postmate;
}
