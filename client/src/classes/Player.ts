import { Board } from "./Board";

export class Player {
  constructor(
    public id: string,
    public nickname: string,
    public board = new Board()
  ) {}
}
