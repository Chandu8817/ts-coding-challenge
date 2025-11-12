import { setDefaultTimeout } from "@cucumber/cucumber";

// Increase default step timeout to allow for network/consensus delays
setDefaultTimeout(60 * 1000);
