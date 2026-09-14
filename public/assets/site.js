const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".desktop-nav");

function setMenu(open) {
  if (!menuButton || !nav) return;
  menuButton.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
  document.body.classList.toggle("nav-open", open);
  if (open) nav.querySelector("a")?.focus();
}

menuButton?.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
nav?.addEventListener("click", event => {
  if (event.target.closest("a") && nav.classList.contains("is-open")) setMenu(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && nav?.classList.contains("is-open")) {
    setMenu(false);
    menuButton.focus();
  }
});

const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 10);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const revealItems = [...document.querySelectorAll("[data-reveal]")];
revealItems.forEach(group => {
  if (group.hasAttribute("data-stagger")) {
    [...group.children].forEach((child, index) => child.style.setProperty("--i", index));
  }
});

if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8%", threshold: .12 });
  revealItems.forEach(item => observer.observe(item));
} else {
  revealItems.forEach(item => item.classList.add("is-visible"));
}

document.querySelectorAll("[data-year]").forEach(node => node.textContent = new Date().getFullYear());

const contactForm = document.querySelector("[data-contact-form]");
if (contactForm) {
  const status = contactForm.querySelector("[data-form-status]");
  const submit = contactForm.querySelector("button[type='submit']");
  const params = new URLSearchParams(location.search);
  const interest = params.get("interest");
  if (interest && contactForm.elements.interest) contactForm.elements.interest.value = interest;

  function clearErrors() {
    contactForm.querySelectorAll("[aria-invalid='true']").forEach(el => el.removeAttribute("aria-invalid"));
    contactForm.querySelectorAll("[data-error]").forEach(el => el.textContent = "");
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.classList.add("is-visible");
    status.focus();
  }

  contactForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearErrors();
    status.classList.remove("is-visible", "is-error");
    submit.disabled = true;
    submit.textContent = "Sending…";

    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());
    payload.consent = formData.get("consent") === "on";
    payload.source = document.referrer || location.pathname;
    payload.campaign = params.get("utm_campaign") || "";
    payload.turnstileToken = formData.get("cf-turnstile-response") || "";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        Object.entries(result.errors || {}).forEach(([name, message]) => {
          const input = contactForm.elements[name];
          if (input) input.setAttribute("aria-invalid", "true");
          const error = contactForm.querySelector(`[data-error="${name}"]`);
          if (error) error.textContent = message;
        });
        showStatus(result.message || "Please check the form and try again.", true);
        contactForm.querySelector("[aria-invalid='true']")?.focus();
      } else {
        contactForm.reset();
        showStatus(result.message);
      }
    } catch {
      showStatus("The form is temporarily unavailable. Email hello@nexora.example instead.", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "Send enquiry";
    }
  });
}
