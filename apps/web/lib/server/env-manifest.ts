export type EnvironmentGroup =
  | "core"
  | "auth"
  | "razorpay"
  | "openrouter"
  | "admin"
  | "retrieval"
  | "monitoring"
  | "development";

export type EnvironmentVariableDefinition = {
  name: string;
  group: EnvironmentGroup;
  required: boolean;
  vercelProductionRequired: boolean;
  clientVisible: boolean;
  description: string;
};

export const ENVIRONMENT_VARIABLES: EnvironmentVariableDefinition[] = [
  { name: "NEXT_PUBLIC_SITE_URL", group: "core", required: false, vercelProductionRequired: false, clientVisible: true, description: "Canonical site URL used by public/client flows when needed." },
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "auth", required: true, vercelProductionRequired: true, clientVisible: true, description: "Supabase project URL." },
  { name: "SUPABASE_URL", group: "auth", required: false, vercelProductionRequired: false, clientVisible: false, description: "Server-side alias fallback for the Supabase project URL." },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "auth", required: true, vercelProductionRequired: true, clientVisible: true, description: "Supabase anonymous key for Auth client flows." },
  { name: "SUPABASE_ANON_KEY", group: "auth", required: false, vercelProductionRequired: false, clientVisible: false, description: "Server-side alias fallback for the Supabase anonymous key." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "auth", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-only Supabase service role key for durable user/payment/usage operations." },
  { name: "SVA_SESSION_SECRET", group: "auth", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-only HMAC secret for SVA session cookies." },
  { name: "RAZORPAY_KEY_ID", group: "razorpay", required: true, vercelProductionRequired: true, clientVisible: false, description: "Razorpay key ID for server-side checkout order creation." },
  { name: "RAZORPAY_KEY_SECRET", group: "razorpay", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-only Razorpay secret for payment signature checks." },
  { name: "RAZORPAY_WEBHOOK_SECRET", group: "razorpay", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-only Razorpay webhook signing secret." },
  { name: "OPENROUTER_API_KEY", group: "openrouter", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-only central OpenRouter API key for Verified Mode inference." },
  { name: "OPENROUTER_MANAGEMENT_KEY", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional OpenRouter management/balance key for admin health checks." },
  { name: "OPENROUTER_WARNING_BALANCE_USD", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional low-balance warning threshold." },
  { name: "OPENROUTER_CRITICAL_BALANCE_USD", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional low-balance critical threshold." },
  { name: "SVA_BUDGET_USD_TO_INR", group: "monitoring", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional budgeting conversion rate for contribution-margin alerts." },
  { name: "SVA_GPT_PRIMARY", group: "openrouter", required: true, vercelProductionRequired: true, clientVisible: false, description: "Primary GPT-family OpenRouter model ID." },
  { name: "SVA_GPT_FALLBACK", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Fallback GPT-family OpenRouter model ID." },
  { name: "SVA_GEMINI_PRIMARY", group: "openrouter", required: true, vercelProductionRequired: true, clientVisible: false, description: "Primary Gemini-family OpenRouter model ID." },
  { name: "SVA_GEMINI_FALLBACK", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Fallback Gemini-family OpenRouter model ID." },
  { name: "SVA_DEEPSEEK_PRIMARY", group: "openrouter", required: true, vercelProductionRequired: true, clientVisible: false, description: "Primary DeepSeek-family OpenRouter model ID." },
  { name: "SVA_DEEPSEEK_FALLBACK", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Fallback DeepSeek-family OpenRouter model ID." },
  { name: "SVA_SYNTHESIS_PRIMARY", group: "openrouter", required: true, vercelProductionRequired: true, clientVisible: false, description: "Primary synthesis OpenRouter model ID." },
  { name: "SVA_SYNTHESIS_FALLBACK", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Fallback synthesis OpenRouter model ID." },
  { name: "PRO_OPENROUTER_MODEL_A", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy GPT-family model alias." },
  { name: "PRO_OPENROUTER_MODEL_B", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy Gemini-family model alias." },
  { name: "PRO_OPENROUTER_MODEL_C", group: "openrouter", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy DeepSeek-family model alias." },
  { name: "ADMIN_EMAIL", group: "admin", required: true, vercelProductionRequired: true, clientVisible: false, description: "Server-side admin account email." },
  { name: "NEXT_PUBLIC_ADMIN_EMAIL", group: "admin", required: true, vercelProductionRequired: true, clientVisible: true, description: "Public admin email hint used by the admin UI." },
  { name: "RETRIEVAL_PROVIDER", group: "retrieval", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional retrieval provider selector." },
  { name: "WEB_RETRIEVAL_ENDPOINT", group: "retrieval", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional custom web retrieval endpoint." },
  { name: "WEB_RETRIEVAL_API_KEY", group: "retrieval", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional custom web retrieval key." },
  { name: "SERPER_API_KEY", group: "retrieval", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional Serper retrieval key." },
  { name: "TAVILY_API_KEY", group: "retrieval", required: false, vercelProductionRequired: false, clientVisible: false, description: "Optional Tavily retrieval key." },
  { name: "OPENAI_API_KEY", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy/direct provider key; not required for central OpenRouter production routing." },
  { name: "GEMINI_API_KEY", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy/direct provider key; not required for central OpenRouter production routing." },
  { name: "DEEPSEEK_API_KEY", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy/direct provider key; not required for central OpenRouter production routing." },
  { name: "ANTHROPIC_API_KEY", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy/direct provider key; not required for central OpenRouter production routing." },
  { name: "PERPLEXITY_API_KEY", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Legacy/direct provider key; not required for central OpenRouter production routing." },
  { name: "ENABLE_LOCAL_PAYMENT_SIMULATION", group: "development", required: false, vercelProductionRequired: false, clientVisible: false, description: "Local-only payment simulation switch." }
];

const configured = (name: string) => Boolean(process.env[name]?.trim());

export const getEnvironmentHealth = () => {
  const variables = ENVIRONMENT_VARIABLES.map((variable) => ({
    name: variable.name,
    group: variable.group,
    required: variable.required,
    vercelProductionRequired: variable.vercelProductionRequired,
    clientVisible: variable.clientVisible,
    configured: configured(variable.name)
  }));

  const missingRequired = variables
    .filter((variable) => variable.required && !variable.configured)
    .map((variable) => variable.name);

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    integrations: {
      supabase: {
        urlConfigured: configured("NEXT_PUBLIC_SUPABASE_URL") || configured("SUPABASE_URL"),
        anonKeyConfigured: configured("NEXT_PUBLIC_SUPABASE_ANON_KEY") || configured("SUPABASE_ANON_KEY"),
        serviceRoleConfigured: configured("SUPABASE_SERVICE_ROLE_KEY")
      },
      razorpay: {
        keyIdConfigured: configured("RAZORPAY_KEY_ID"),
        keySecretConfigured: configured("RAZORPAY_KEY_SECRET"),
        webhookSecretConfigured: configured("RAZORPAY_WEBHOOK_SECRET")
      },
      openrouter: {
        apiKeyConfigured: configured("OPENROUTER_API_KEY"),
        managementKeyConfigured: configured("OPENROUTER_MANAGEMENT_KEY"),
        modelConfigurationPresent: configured("SVA_GPT_PRIMARY") && configured("SVA_GEMINI_PRIMARY") && configured("SVA_DEEPSEEK_PRIMARY") && configured("SVA_SYNTHESIS_PRIMARY"),
        warningThresholdConfigured: configured("OPENROUTER_WARNING_BALANCE_USD"),
        criticalThresholdConfigured: configured("OPENROUTER_CRITICAL_BALANCE_USD")
      },
      admin: {
        adminEmailConfigured: configured("ADMIN_EMAIL"),
        publicAdminEmailConfigured: configured("NEXT_PUBLIC_ADMIN_EMAIL")
      },
      retrieval: {
        anyRetrievalConfigured: configured("WEB_RETRIEVAL_API_KEY") || configured("SERPER_API_KEY") || configured("TAVILY_API_KEY")
      }
    },
    variables
  };
};
