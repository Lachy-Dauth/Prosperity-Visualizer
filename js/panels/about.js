const HTML = `
  <div class="modal-backdrop" id="about-backdrop">
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" aria-label="Close">×</button>
      <div class="modal-body">
        <h2>🔒 Your strategy never leaves this tab.</h2>
        <p>OpenProsperity Visualizer is a 100% client-side, open-source dashboard for the IMC Prosperity algorithmic trading competition. We built it because by 2am the night before round close, you don't want to wonder whether the analytics tool you're comparing variant B against is quietly cataloging your edge somewhere on someone else's server.</p>

        <h3>What happens to your file</h3>
        <ol>
          <li>You drop a <code>.log</code> file. The browser's File API reads it locally — no network.</li>
          <li>A Web Worker parses the JSON + CSV inside this tab. The data lives only in JavaScript memory.</li>
          <li>Charts render against that in-memory data. Closing the tab wipes everything unless you explicitly opt in to <em>Save to browser</em>, which writes to IndexedDB on this device only.</li>
          <li>No accounts. No telemetry. No analytics cookies. No third-party scripts. Confirm by inspecting the network panel.</li>
        </ol>

        <h3>What this is good at</h3>
        <ul>
          <li>Comparing N variants of your algorithm side-by-side.</li>
          <li>Diff mode: PnL of variant B <em>minus</em> baseline at every tick.</li>
          <li>Normalized x-axis: 1k-tick previews vs 10k-tick full days.</li>
          <li>Order-book replay synced with PnL, position, and fills.</li>
        </ul>

        <h3>Algorithm logs are empty?</h3>
        <p>IMC's sandbox only writes to the Algorithm tab when your code calls <code>print()</code> (or uses the popular jmerle <code>Logger</code> shim, which we decode automatically). If both panes are blank, your algo just didn't emit anything at that tick.</p>

        <h3>Credits</h3>
        <p>Inspired by <a href="https://github.com/jmerle/imc-prosperity-3-visualizer" target="_blank" rel="noreferrer">jmerle's imc-prosperity-3-visualizer</a>, which set the bar for what a static-SPA Prosperity visualizer should look like. This project takes a different angle: comparing multiple strategies as the default, and making the local-only architecture a marketing feature.</p>
      </div>
      <footer class="modal-footer">
        <span>MIT licensed · Open source</span>
        <a class="btn" href="https://github.com/lachy-dauth/prosperity-visualizer" target="_blank" rel="noreferrer">View on GitHub</a>
      </footer>
    </div>
  </div>
`;

export function showAboutModal(rootEl) {
  rootEl.innerHTML = HTML;
  const backdrop = rootEl.querySelector("#about-backdrop");
  function close() {
    rootEl.innerHTML = "";
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  rootEl.querySelector(".modal-close").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}
