using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [(name = "vnau", worker = (
    modules = [
      (name = "test.mjs", esModule = embed "vnau-cloudflare.mjs"),
      (name = "matrix.mjs", esModule = embed "../integrations/vnau/cloudflare/matrix.mjs"),
      (name = "forms.mjs", esModule = embed "../integrations/vnau/cloudflare/forms.mjs"),
      (name = "upstream.mjs", esModule = embed "../integrations/vnau/cloudflare/upstream.mjs"),
      (name = "notifications.mjs", esModule = embed "../integrations/vnau/cloudflare/notifications.mjs"),
      (name = "worker.mjs", esModule = embed "../integrations/vnau/cloudflare/worker.mjs")
    ],
    compatibilityDate = "2026-11-04",
    bindings = [
      (name = "GROUP_EI", text = embed "fixtures/vnau_group_ei23.html"),
      (name = "GROUP_KN", text = embed "fixtures/vnau_group_kn24.html"),
      (name = "TEACHER_BOIKO", text = embed "fixtures/vnau_teacher_real.html"),
      (name = "TEACHER_VOVK", text = embed "fixtures/vnau_teacher_parallel.html"),
      (name = "CACHE", durableObjectNamespace = "CacheTestHarness"),
      (name = "MKR_CACHE", durableObjectNamespace = "CacheTestHarness"),
      (name = "TEST_TELEGRAM", service = "telegram"),
      (name = "TELEGRAM_TEST_BOT_TOKEN", text = "123456:synthetic_test_token_abcdefghijklmnopqrstuvwxyz")
    ],
    durableObjectNamespaces = [(className = "CacheTestHarness", uniqueKey = "depara-cache-tests", enableSql = true)],
    durableObjectStorage = (localDisk = "test-storage")
  )), (name = "telegram", worker = (
    modules = [(name = "mock.mjs", esModule = embed "fixtures/mock_telegram.mjs")],
    compatibilityDate = "2026-11-04"
  )), (name = "test-storage", disk = (path = ".", writable = true))]
);
