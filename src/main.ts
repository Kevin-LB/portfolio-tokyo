import "@fontsource-variable/instrument-sans/wdth.css";
import "./styles/main.css";
import { boot } from "./app";

boot().catch((error) => {
  console.error(error);
  document.documentElement.dataset.mode = "lecture";
  document.querySelector("#loader")?.classList.add("is-done");
});
