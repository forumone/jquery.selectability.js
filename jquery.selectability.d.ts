/// <reference types="jquery" />

interface JQuery {
  selectability(): this;
}

interface SelectabilityEvent extends JQueryEventObject {
  selectability: boolean;
  val: string;
}