export type Route = {
  method: string;
  path: RegExp;
  handler: (req: Request, params: any) => Promise<Response> | Response;
};
