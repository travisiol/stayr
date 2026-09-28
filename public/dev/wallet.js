// Development-only wallet stub for the local Hardhat stack.
//
// Announces itself over EIP-6963 as "Hardhat dev wallet" and relays every
// request to the local node; transactions are sent unsigned from an unlocked
// Hardhat account, which the node accepts. Load it from the browser console
// on the local site (never shipped in a link from the app):
//
//   const s = document.createElement("script"); s.src = "/dev/wallet.js"; document.head.appendChild(s);
//
// Optional: window.__DEV_WALLET_ACCOUNT = "0x…" before loading to pick the
// account (default: Hardhat account #1). Requests rejected via
// window.__DEV_WALLET_REJECT = true to test the "rejected in wallet" state.
(function () {
  var RPC = "http://127.0.0.1:8868";
  // window.__DEV_WALLET_CHAIN_ID = "0x1" before loading simulates a wallet on the wrong network.
  var CHAIN_ID = window.__DEV_WALLET_CHAIN_ID || "0x7a69";
  var ACCOUNT = (window.__DEV_WALLET_ACCOUNT || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8").toLowerCase();
  var listeners = {};
  var id = 1;

  function rpc(method, params) {
    return fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: method, params: params || [] }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) { var e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
        return j.result;
      });
  }

  function chainId() { return window.__DEV_WALLET_CHAIN_ID || CHAIN_ID; }
  function emit(ev, payload) { (listeners[ev] || []).forEach(function (fn) { fn(payload); }); }

  var provider = {
    isDevWallet: true,
    /** Test hook: provider.setChain("0x1") simulates the user switching networks in the wallet. */
    setChain: function (id) { window.__DEV_WALLET_CHAIN_ID = id; emit("chainChanged", id); },
    request: function (args) {
      var method = args.method, params = args.params || [];
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return Promise.resolve([ACCOUNT]);
        case "eth_chainId":
          return Promise.resolve(chainId());
        case "net_version":
          return Promise.resolve(String(parseInt(chainId(), 16)));
        case "wallet_switchEthereumChain":
          provider.setChain(params[0] && params[0].chainId ? params[0].chainId : CHAIN_ID);
          return Promise.resolve(null);
        case "wallet_addEthereumChain":
          return Promise.resolve(null);
        case "eth_sendTransaction": {
          if (window.__DEV_WALLET_REJECT) {
            var err = new Error("User rejected the request."); err.code = 4001; return Promise.reject(err);
          }
          var tx = Object.assign({}, params[0], { from: ACCOUNT });
          delete tx.gas; delete tx.gasPrice; delete tx.maxFeePerGas; delete tx.maxPriorityFeePerGas; delete tx.type;
          window.__DEV_WALLET_LAST_TX = tx;
          return rpc("eth_sendTransaction", [tx]);
        }
        case "personal_sign":
        case "eth_signTypedData_v4":
          return Promise.reject(Object.assign(new Error("signing not supported by the dev wallet"), { code: 4200 }));
        default:
          return rpc(method, params);
      }
    },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return provider; },
    removeListener: function (ev, fn) { listeners[ev] = (listeners[ev] || []).filter(function (f) { return f !== fn; }); return provider; },
  };

  var detail = Object.freeze({
    info: { uuid: "b1c3d6a0-2f5e-4c8b-9d1e-stayr-dev-wallet", name: "Hardhat dev wallet", icon: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#194B38"/><path d="M10 8h12v3l-4 5 4 5v3H10v-3l4-5-4-5z" fill="#D9EDB4"/></svg>'), rdns: "xyz.stayr.devwallet" },
    provider: provider,
  });
  function announce() { window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: detail })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  window.__DEV_WALLET = provider;
  console.log("[stayr] dev wallet announced for", ACCOUNT);
})();
