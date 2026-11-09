import { withRateLimit } from '../../lib/rateLimit';
import OpenAI from 'openai';
import { getDistance } from 'geolib';
import { formatWorldPopForAI } from '../../utils/worldpopHelpers';
import { formatOSMForAI } from '../../lib/osmHelpers';
import { buildChatContextualAnalysis, formatContextualAnalysisForPrompt } from '../../lib/contextualAnalysis';
import { summarizeDistrictAttributes } from '../../lib/adminProperties';
import { formatAccessChatContext } from '../../lib/platform/resultContext';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

// Note: Web search is now handled natively by OpenAI's gpt-4o-search-preview model
// The model will automatically perform web searches when needed using the web_search tool

// Get current date and time
function getCurrentDateTime() {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0], // YYYY-MM-DD
    time: now.toUTCString(),
    timestamp: now.toISOString(),
    day: now.toLocaleDateString('en-US', { weekday: 'long' }),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    dayOfMonth: now.getDate()
  };
}

// Define tools for OpenAI function calling
const tools = [
  {
    type: "function",
    function: {
      name: "get_current_date",
      description: "Get the current date and time. Use this when you need to know today's date, the current year, or when discussing 'today', 'now', or 'current' time periods.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

// Must cover every district in a province (or a whole country); a 25-cap silently
// dropped ~11 of Ituri's 36 health zones when resolving a province highlight.
const MAX_ADMIN_AREA_MATCHES = 500;
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';
const WEB_SEARCH_CHAT_MODEL = process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-4o-search-preview';

// Web search configuration for Chat Completions API
// Note: For gpt-4o-search-preview, use web_search_options parameter instead of tools array
const webSearchOptions = {
  search_context_size: "high"
};

function shouldUseWebSearch(message = '', context = {}) {
  const lower = String(message).toLowerCase();

  const explicitWebTerms = [
    'latest', 'today', 'current', 'current situation', 'recent', 'news',
    'headline', 'headlines', 'update', 'updates', 'look up', 'lookup',
    'search', 'web search', 'online', 'verify', 'confirm'
  ];
  const guidanceTermsNeedingFreshness = [
    'who guidance', 'cdc guidance', 'ministry guidance', 'policy',
    'restriction', 'restrictions', 'travel advisory', 'security update'
  ];

  const asksForFreshInfo =
    explicitWebTerms.some((term) => lower.includes(term)) ||
    guidanceTermsNeedingFreshness.some((term) => lower.includes(term));

  const hasLoadedOperationalData =
    (context?.facilities?.length || 0) > 0 ||
    (context?.disasters?.length || 0) > 0 ||
    (context?.outbreaks?.length || 0) > 0 ||
    (context?.acledData?.length || 0) > 0 ||
    Boolean(context?.weatherForecast) ||
    Boolean(context?.worldPopData && Object.keys(context.worldPopData).length > 0) ||
    Boolean(context?.prioritizationBoard?.districtRows?.length) || Boolean(context?.accessAssessment);

  return asksForFreshInfo || !hasLoadedOperationalData;
}

function buildChatCompletionParams({ model, messages, stream, useWebSearch }) {
  const params = {
    model,
    messages,
    max_tokens: 1500,
    stream
  };

  if (useWebSearch) {
    params.web_search_options = webSearchOptions;
  } else {
    params.temperature = 0.3;
  }

  return params;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, context, conversationHistory = [], stream = false, detailLevel = 'compact' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Detect map interaction intents (highlight, show, filter districts)
    const mapIntent = detectMapIntent(message, context);
    console.log('Detected map intent:', mapIntent);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      return res.status(200).json({
        response: "I'm sorry, but the AI chat feature requires an OpenAI API key to be configured. Please contact your administrator.",
        isAIGenerated: false
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Debug: Log what context we received
    console.log('Chat API received context:', {
      facilities: context?.facilities?.length,
      disasters: context?.disasters?.length,
      outbreaks: context?.outbreaks?.length,
      chatAttachments: context?.chatAttachments?.length,
      acledData: context?.acledData?.length,
      acledEnabled: context?.acledEnabled,
      osmData: context?.osmData?.features?.length,
      osmDataMetadata: context?.osmData?.metadata,
      worldPopData: context?.worldPopData ? Object.keys(context.worldPopData).length : 0,
      worldPopYear: context?.worldPopYear
    });

    const contextualAnalysis = buildChatContextualAnalysis(context, context?.operationType || 'general');
    const contextualAnalysisSummary = formatContextualAnalysisForPrompt(contextualAnalysis);
    const deepContextSummary = detailLevel === 'deep'
      ? buildDeepContextSummary(context, message, conversationHistory)
      : '';

    // Build context summary for the AI
    const contextSummary = [
      contextualAnalysisSummary,
      deepContextSummary,
      formatAccessChatContext(context?.accessAssessment),
      buildContextSummary(context)
    ].filter(Boolean).join('\n\n');

    // Log context size for debugging
    const contextSize = contextSummary.length;
    const estimatedTokens = Math.ceil(contextSize / 4); // Rough estimate: 1 token ≈ 4 chars
    console.log(`Context summary: ${contextSize} characters, ~${estimatedTokens} tokens`);

    // Debug: Log if ACLED section is in the summary
    if (contextSummary.includes('ACLED')) {
      console.log('✅ ACLED data IS in context summary');
    } else {
      console.log('❌ ACLED data NOT in context summary');
    }

    // Get current date
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentDateTime = new Date().toUTCString();

    const useWebSearch = shouldUseWebSearch(message, context);
    const chatModel = useWebSearch ? WEB_SEARCH_CHAT_MODEL : DEFAULT_CHAT_MODEL;

    // Build conversation messages
    const messages = [
      {
        role: "system",
        content: `You are an expert humanitarian aid and disaster response advisor with deep knowledge of:

**📅 CURRENT DATE & TIME**: Today is ${currentDate} (${currentDateTime}). Always use this date when discussing "today", "recent", or "current" events. You also have access to the 'get_current_date' function if you need to verify the current date during the conversation.

**🌐 WEB SEARCH CAPABILITY**: You have access to real-time web search through OpenAI's native web_search tool.

**💬 CHAT MODE**: The current request is in ${detailLevel === 'deep' ? 'DEEP' : 'COMPACT'} mode.
- COMPACT mode: prioritize speed, concise synthesis, and the contextual-analysis layer.
- DEEP mode: the user is asking for evidence-heavy or detailed analysis. Use the targeted detailed context provided, cite specific event/site details from context, and favor precision over brevity.

**🗺️ MAP AND EVIDENCE LAYERS**:
- If the context says a map or evidence layer is loaded, treat it as available data.
- Nighttime lights means the VIIRS monthly night-lights layer is active in the workspace. You may use it as contextual evidence for population concentration, settlement footprint, infrastructure concentration, and possible electrification patterns.
- Do NOT treat nighttime lights as direct proof of current outages, direct damage, or real-time service failure unless comparative outage evidence is explicitly provided.
- If nighttime lights are not loaded, do not infer from them. Say they are not currently loaded and tell the user to switch the map layer to Nighttime Lights (GEE) if they want that context.

⚡ **CRITICAL RULE - DATA PRIORITY**:
1. ALWAYS use data loaded in your context FIRST (facilities, disasters, ACLED, WorldPop population, weather)
2. ONLY use web search for information NOT available in your context
3. When WorldPop population data is loaded, NEVER search the web for population statistics
4. When facilities/districts are loaded, NEVER search for facility lists or location data
5. When selectedAnalysisDistricts is present, treat those districts as the active admin scope for district-level analysis

Use web search ONLY for:
- Recent news and events not in the disaster feed
- Current WHO/CDC guidelines and best practices
- Humanitarian situation updates beyond what's in the context
- Information that may have changed since your training data cutoff
- Verification of non-quantitative information (policies, guidelines, etc.)

**🗓️ SEARCH RECENCY RULES — STRICTLY FOLLOW THESE**:
- Today is ${currentDate}. Always include the current year (${new Date().getFullYear()}) in your search queries to surface recent results (e.g., "Pakistan security situation ${new Date().getFullYear()}", "floods Pakistan ${new Date().getFullYear()}").
- When you find search results, CHECK THE DATE of each source. If a source is from before 2024, treat it as historical background only — do NOT present it as current information.
- If your search only returns results older than 12 months, explicitly tell the user: "I could only find information from [date] — this may be outdated. Please verify with current sources."
- NEVER present 2021, 2022, or 2023 data as if it describes the current situation without clearly stating the year it's from.
- For security situations, disease outbreaks, and conflict data: always search for the most recent 3-6 months of information.

**🔗 SOURCE LINK RULES — STRICTLY FOLLOW THESE**:
- When you use web search, news articles, external situation reports, WHO/CDC/ministry guidance, or any external webpage, include the website/source name and a clickable markdown link.
- Prefer this format: "According to [Website or Organization - article/report title](https://example.com/source-url), ..."
- End answers that rely on external web information with a short "Sources" section containing 1-4 markdown links. Include publication/update dates when available.
- Do not say "an article says" or "a source says" without naming and linking the source.
- If you cannot access or identify the source URL, say that clearly instead of implying a clickable citation exists.

**🌤️ WEATHER FORECAST DATA**: You have access to weather forecast data in your context when facilities or districts are loaded:
- Regional weather forecasts cover the operational area (center point of all facilities)
- District-level forecasts (when administrative boundaries are uploaded)
- Use weather data to assess campaign viability, predict disease outbreaks (cholera, malaria), and identify supply chain risks
- Weather warnings indicate flood risk, extreme temperatures, or conditions affecting operations
- Integrate weather with disaster data for comprehensive risk assessment

Core expertise areas:
- Disaster management and emergency response
- Public health programs (malaria, polio, immunization campaigns)
- SPHERE standards and humanitarian protocols
- WHO guidelines and CERF requirements
- Supply chain management in crisis contexts
- Field operations and logistics
- Campaign viability assessment and planning
- Alliance for Malaria Prevention (AMP) best practices and operational guidance
- ITN/LLIN distribution strategies (mass campaigns, routine channels, school-based)
- cLQAS (clustered Lot Quality Assurance Sampling) assessment procedures
- Digital tools for campaign monitoring (mobile data collection, geospatial planning, barcode scanning)
- Vector control in emergency settings
- Malaria response in humanitarian crises, armed conflict, and IDP settings

The user is viewing a disaster impact assessment tool. You have access to the current context of their situation including site data, active disasters, and impact assessments.

Current Context:
${contextSummary}

Your role is to:
1. Answer questions about how disasters impact specific health programs and operations
2. Provide actionable recommendations based on the current situation
3. Help with scenario planning and decision-making
4. Explain technical humanitarian concepts in plain language
5. Reference specific sites, disasters, and data from the context when relevant
6. When asked about sites, you MUST reference the sites list provided in the context above
7. When districts are actively selected in the context, answer about that selected admin area unless the user clearly asks about the full uploaded shapefile
7a. When the user asks which district to avoid, which areas are unsafe, no-go, or highest risk, use the active district risk assessment and prioritization board first. Name the highest-risk district(s) in the current analysis scope and explain the evidence basis.
8. **Campaign Planning Support**: When asked about campaign viability, feasibility, or "can I run a campaign at [site]", provide guidance on:
   - Whether it's safe to proceed with health campaigns (malaria, immunization, etc.)
   - Specific risks for campaign teams and target populations
   - Cold chain considerations for vaccine programs
   - Population displacement and coverage implications
   - Timeline recommendations (go immediately, wait X days/weeks, postpone)
   - Mitigation strategies for identified risks
   - Resource adjustments needed (extra supplies, mobile teams, etc.)
9. **Malaria Program Expertise** (following AMP guidance):
   - ITN/LLIN distribution channel selection (mass campaign vs routine vs school-based based on context)
   - Post-disaster vector control intensification (floods create breeding sites, coordinate with WASH)
   - Expected malaria case surge: 40-60% increase after floods, 50% increase in ACT/RDT stock needed
   - Supply chain: Pre-positioning nets, barcode tracking, digitalization
   - At-risk populations: IDPs, conflict-affected areas, displaced communities
   - Assessment planning: Recommend cLQAS methodology (10-step process) for campaign quality assurance
   - Digital tools: Mobile data collection (BYOD), geospatial microplanning, real-time dashboards
10. **Assessment Procedures** (cLQAS methodology):
   - In-process evaluations: During household registration and distribution
   - End-process evaluations: Post-campaign coverage assessment
   - Rapid assessments: For emergency/disaster contexts
   - Recommend specific assessment timing based on campaign status and disaster situation

IMPORTANT:
- Use "site" / "sites" in user-facing responses, headings, and table column names by default. Only use "facility" when you are referring to a specific facility type already present in the data, such as hospital, clinic, warehouse, or school.
- When the user asks for a table, prefer a markdown table with a first column named "Site" rather than "Facility", unless the user explicitly asks for a different label.
- The user has uploaded site data that is visible in the "SITES LIST" section above. When asked questions like "which sites have I added" or "what sites do I have", you should list out the sites from the SITES LIST in the context, including their names, locations, types, and any other relevant details.
- **SITE DATA FIELDS**: If you see "📊 AI ANALYSIS FIELDS LOADED" in the context, the user has selected specific data fields for you to analyze. The actual data values from these fields are included in each site's listing above (shown inline after the site name and location). You MUST use this data to answer questions about site characteristics, populations, disease prevalence, service coverage, or any other metrics the user asks about.
- **ACLED COUNT RULE**: If the context includes "Current analysis scope ACLED events", use that number when the user asks "how many ACLED events" or asks for the count in the current selected area. Only use the full loaded ACLED total if the user explicitly asks about the whole uploaded dataset or full system count.
- **ACLED DETAIL RULE**: When ACLED event records in context include notes, actor1, actor2, sub_event_type, or source, use those fields when the user asks what happened in a specific event or location. Treat notes as the primary event-detail field.
- For campaign planning questions, consider: disaster proximity, cold chain risks, access constraints, population displacement, staff safety, and program-specific needs (ACTs for malaria, vaccines for immunization)
- For malaria programs after floods: ALWAYS recommend 50% increase in ACT/RDT stock, coordinate with WASH for vector control, monitor for 40-60% case surge
- Provide GO/NO-GO/DELAY/CAUTION recommendations with clear rationale based on AMP and WHO best practices
- Suggest appropriate digital tools and assessment procedures when relevant
- **Prioritization Board Use**: If the context includes a prioritization board, treat it as the primary decision layer for questions like "top priorities", "which admin levels should we focus on", "urgent areas", "what should leadership do", or "summarize the prioritization matrix". Reference the ranked admin levels, posture, recommended action, and key gaps directly from that board before using other context.

**DISTRICT-LEVEL ANALYSIS (When Administrative Boundaries Shapefile is Uploaded):**
- When a shapefile is uploaded, you have access to detailed district-level risk assessment data in the "ADMINISTRATIVE BOUNDARIES SHAPEFILE" section
- When the context includes an "ACTIVE ADMIN-AREA SELECTION" section, that selection overrides the broader shapefile for district-specific questions
- Focus your analysis on the specific geographic area covered by the shapefile (check the Country, Region, and Coverage Area)
- Reference specific districts by name when discussing risks, especially the examples provided in each risk category
- When the user asks you to "highlight" or "show" districts on the map (e.g., "highlight high risk districts", "show me no-go areas"):
  1. Explain which districts match their criteria based on the risk breakdown
  2. List specific district names if available
  3. Provide context about why these districts are at that risk level
  4. The system will automatically apply the map action when the request matches a supported command
- Supported chat map actions include highlighting or selecting admin areas, coloring admin boundaries by risk or a loaded numeric field, placing a pin when coordinates or a named admin area are provided, clearing chat-added highlights/pins/selections, clearing the entire map, unselecting all districts, toggling admin borders or labels, and controlling OSM infrastructure layers. Do not tell the user you cannot clear the map, unselect districts, or remove selections; the system can apply those map actions when the user says "clear map", "clear everything", "unselect all", "deselect all", "clear selection", or similar commands.
- OSM infrastructure control: You can show, hide, or remove OSM infrastructure layers via chat. Available categories: hospitals (includes clinics), schools, roads, bridges, water, power, fuel, pharmacies, airports. Commands: "show schools" / "map hospitals" (loads & displays), "hide roads" (keeps data, hides from map), "remove bridges" (clears data completely). IMPORTANT: When the user asks to show/map/display any OSM infrastructure type, respond as if the data is being loaded right now, even if it's not currently in the context. Say something like "Loading schools now..." or "Mapping hospitals in the selected area..." - the system will automatically trigger the data load. Do not say the data is not available or ask them to provide it.
- Supported metric map actions include proportional bubbles/circles and choropleths from any loaded numeric map field listed in AVAILABLE NUMERIC MAP FIELDS. When the user asks to draw, map, color, or make bubbles/circles for a metric, do not say you cannot draw it. Identify the exact loaded numeric field name you are using and respond as if the map action is being applied. If the requested wording does not clearly match a listed numeric field, ask a short clarification question and list 2-4 candidate field names instead of guessing. Do not infer a field from a single generic overlap such as "site", "count", "case", or "data".
- Always frame your district analysis in the context of the uploaded shapefile area (e.g., "In [Country/Region], based on the uploaded administrative boundaries...")
- Use the risk breakdown percentages to give an overall security picture of the area
- When discussing campaign planning, reference which districts are safe vs. risky for operations

Be direct, practical, and specific. Use the context data to give personalized answers following AMP operational guidance. When districts are loaded, prioritize district-level analysis for geographic risk assessment.`
      }
    ];

    // Add conversation history (capped to last 20 messages to avoid token limit failures)
    conversationHistory.slice(-20).forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    // Call OpenAI API with streaming if requested
    if (stream) {
      // Set headers for SSE streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.setHeader('Content-Encoding', 'none'); // Disable compression

      // Send headers immediately to establish connection
      res.flushHeaders();

      // If there's a map intent, send it first as a special command
      if (mapIntent) {
        res.write(`data: ${JSON.stringify({ mapCommand: mapIntent })}\n\n`);
        if (res.flush) res.flush();
      }

      console.log('📤 Calling OpenAI API with streaming...');
      console.log('Model:', chatModel);
      console.log('Web search enabled:', useWebSearch);
      const streamTimerLabel = `OpenAI stream start ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.time(streamTimerLabel);

      try {
        const streamResponse = await openai.chat.completions.create(
          buildChatCompletionParams({
            model: chatModel,
            messages,
            stream: true,
            useWebSearch
          })
        );

        console.timeEnd(streamTimerLabel);
        console.log('✅ OpenAI stream started, processing chunks...');

      let chunkCount = 0;
      let toolCalls = [];

      for await (const chunk of streamResponse) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;

        // Handle text content
        if (delta?.content) {
          chunkCount++;
          if (chunkCount === 1) {
            console.log('🎉 First chunk received!');
          }
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          if (res.flush) res.flush();
        }

        // Handle tool calls (function calling)
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            if (toolCallDelta.index !== undefined) {
              // New tool call or continuing existing one
              if (!toolCalls[toolCallDelta.index]) {
                toolCalls[toolCallDelta.index] = {
                  id: toolCallDelta.id || '',
                  type: toolCallDelta.type || 'function',
                  function: {
                    name: toolCallDelta.function?.name || '',
                    arguments: toolCallDelta.function?.arguments || ''
                  }
                };
              } else {
                // Append to existing tool call
                if (toolCallDelta.function?.arguments) {
                  toolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }
        }

        // Check if finish reason indicates tool calls
        if (choice?.finish_reason === 'tool_calls' && toolCalls.length > 0) {
          console.log('🔧 AI requested tool calls:', toolCalls);

          // Execute tool calls
          const toolResults = [];
          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'get_current_date') {
              try {
                const dateInfo = getCurrentDateTime();
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  name: 'get_current_date',
                  content: JSON.stringify(dateInfo, null, 2)
                });
                console.log('✅ Current date provided:', dateInfo.date);
              } catch (error) {
                console.error('Error getting current date:', error);
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  name: 'get_current_date',
                  content: `Error: ${error.message}`
                });
              }
            }
            // Note: web_search tool calls are handled natively by OpenAI
            // No need to manually execute them
          }

          // Make a second API call with tool results
          if (toolResults.length > 0) {
            messages.push({
              role: 'assistant',
              tool_calls: toolCalls.map(tc => ({
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments
                }
              }))
            });

            toolResults.forEach(result => {
              messages.push(result);
            });

            // Continue streaming with tool results
            const followUpStream = await openai.chat.completions.create(
              buildChatCompletionParams({
                model: chatModel,
                messages,
                stream: true,
                useWebSearch
              })
            );

            for await (const followUpChunk of followUpStream) {
              const followUpContent = followUpChunk.choices[0]?.delta?.content;
              if (followUpContent) {
                res.write(`data: ${JSON.stringify({ content: followUpContent })}\n\n`);
                if (res.flush) res.flush();
              }
            }
          }
        }
      }

      console.log(`✅ Stream complete. Total chunks: ${chunkCount}`);
      res.write('data: [DONE]\n\n');
      res.end();
      } catch (streamError) {
        try {
          console.timeEnd(streamTimerLabel);
        } catch {
          // Timer may already have ended after a successful stream start.
        }
        console.error('❌ Streaming error:', streamError);
        console.error('Error details:', streamError.message);
        if (streamError.response) {
          console.error('OpenAI error response:', await streamError.response.json());
        }
        const isNetworkError = streamError?.cause?.code === 'ENOTFOUND' ||
          streamError?.code === 'ENOTFOUND' ||
          /ENOTFOUND|getaddrinfo|Connection error/i.test(streamError?.message || '');
        const userMessage = isNetworkError
          ? 'I could not reach the OpenAI API because DNS/network lookup failed. The map command may still have been applied locally, but the AI text response could not be generated. Please retry once network connectivity is back.'
          : `The AI response stream failed: ${streamError.message}`;
        res.write(`data: ${JSON.stringify({
          error: {
            message: userMessage,
            retryable: isNetworkError,
            code: streamError?.cause?.code || streamError?.code || null
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      // Non-streaming mode with web search
      let response = await openai.chat.completions.create(
        buildChatCompletionParams({
          model: chatModel,
          messages,
          stream: false,
          useWebSearch
        })
      );

      // Handle function calls if requested
      let finalResponse = response.choices[0].message;

      if (finalResponse.tool_calls && finalResponse.tool_calls.length > 0) {
        console.log('🔧 AI requested tool calls (non-streaming)');

        // Add assistant message with tool calls to history
        messages.push(finalResponse);

        // Execute each tool call
        for (const toolCall of finalResponse.tool_calls) {
          if (toolCall.function.name === 'get_current_date') {
            try {
              const dateInfo = getCurrentDateTime();
              console.log(`📅 Providing current date: ${dateInfo.date}`);

              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: 'get_current_date',
                content: JSON.stringify(dateInfo, null, 2)
              });
            } catch (error) {
              console.error('Error getting current date:', error);
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: 'get_current_date',
                content: `Error: ${error.message}`
              });
            }
          }
          // Note: web_search tool calls are handled natively by OpenAI
          // No need to manually execute them
        }

        // Make a second API call with tool results
        const followUpResponse = await openai.chat.completions.create(
          buildChatCompletionParams({
            model: chatModel,
            messages,
            stream: false,
            useWebSearch
          })
        );

        finalResponse = followUpResponse.choices[0].message;
      }

      res.status(200).json({
        response: finalResponse.content,
        isAIGenerated: true,
        mapIntent: mapIntent || undefined
      });
    }

  } catch (error) {
    console.error('Error in chat API:', error);

    // Provide helpful fallback response
    res.status(200).json({
      response: "I apologize, but I encountered an error processing your question. Please try rephrasing your question or contact support if the issue persists.",
      isAIGenerated: false,
      error: error.message
    });
  }
}

function detectMapIntent(message, context = {}) {
  const lowerMessage = message.toLowerCase();
  const hasClearVerb = /(?:\bclear\b|\breset\b|\b[a-z]*remove\b)/.test(lowerMessage);
  const hasClearOrResetVerb = /\b(clear|reset)\b/.test(lowerMessage);

  // Handle "clear map" or "clear everything" - clears all map overlays
  if ((hasClearOrResetVerb || /\b(remove all|remove everything)\b/.test(lowerMessage)) &&
      /\b(map|everything|all)\b/.test(lowerMessage) &&
      !/\b(pin|marker|highlight|annotation|bubble|metric|layer|choropleth)\b/.test(lowerMessage)) {
    return { action: 'clear_all_map_overlays' };
  }

  // Handle "unselect all" or "clear selection" or "deselect all" - clears analysis scope
  // Must explicitly mention unselect/deselect or have "all" with clear/reset
  if ((/\b(unselect|deselect)\b/.test(lowerMessage) && /\b(all|districts?|admin|areas?|everything|selection)\b/.test(lowerMessage)) ||
      (/\b(clear|reset|remove)\b/.test(lowerMessage) && /\b(selection|all districts?|all admin|all areas?)\b/.test(lowerMessage))) {
    // This is a global clear command, not a selective deselect
    if (!/\b(from analysis|from scope|specific|only|named|called)\b/.test(lowerMessage)) {
      return { action: 'clear_analysis_scope' };
    }
  }

  if ((hasClearOrResetVerb && /\b(admin|district|districts|boundary|boundaries)\b/.test(lowerMessage)) ||
      (hasClearVerb && /\b(choropleth|chlorepleth|color map|colour map|bubble|bubbles|circle|circles|metric layer|metric layers|case map|disease layer)\b/.test(lowerMessage))) {
    return { action: 'clear_metric_layers' };
  }

  if (hasClearVerb && /\b(bubble|bubbles|circle|circles|proportional symbol|proportional symbols)\b/.test(lowerMessage)) {
    return { action: 'clear_metric_bubbles' };
  }

  if (hasClearVerb && /\b(metric|metrics|case map|disease layer|choropleth|chlorepleth|color map|colour map)\b/.test(lowerMessage)) {
    return { action: 'clear_metric_layers' };
  }

  if (hasClearVerb && /\b(highlight|highlights|highlighting)\b/.test(lowerMessage)) {
    return { action: 'clear_highlights' };
  }

  if (hasClearVerb && /\b(pin|pins|marker|markers|dot|dots|annotation|annotations)\b/.test(lowerMessage)) {
    return { action: 'clear_map_annotations' };
  }

  if (/\b(clear|reset|remove all)\b/.test(lowerMessage) && /\b(analysis scope|analysis selection|selected admin|selected district|selected districts|selected areas)\b/.test(lowerMessage)) {
    return { action: 'clear_analysis_scope' };
  }

  const adminDisplayCommand = detectAdminDisplayCommand(message);
  if (adminDisplayCommand) {
    return adminDisplayCommand;
  }

  const markerCommand = detectMarkerCommand(message, context);
  if (markerCommand) {
    return markerCommand;
  }

  const osmCommand = detectOSMCommand(message, context);
  if (osmCommand) {
    return osmCommand;
  }

  if (!context || !context.hasDistricts) {
    return null; // No districts loaded, can't perform district actions
  }

  // Keywords for highlighting/showing districts
  const highlightKeywords = ['highlight', 'show on map', 'display on map', 'point out on map', 'map', 'visualize'];
  const selectKeywords = ['select', 'set scope', 'focus on', 'use only', 'analyze only'];
  const deselectKeywords = ['deselect', 'unselect', 'remove from analysis', 'remove from scope', 'exclude from analysis', 'exclude from scope'];
  const hasDeselectPhrase = /\b(remove|exclude|deselect|unselect)\b[\s\S]{0,120}\b(from|for)\s+(?:the\s+)?(analysis|scope|selection)\b/.test(lowerMessage) ||
    /\b(remove|exclude|deselect|unselect)\b[\s\S]{0,120}\b(analysis scope|selected areas|selected admin|selected districts?)\b/.test(lowerMessage);
  const riskKeywords = ['high risk', 'very high risk', 'dangerous', 'unsafe', 'no go', 'no-go', 'risky', 'risk', 'threat'];
  const safeKeywords = ['safe', 'low risk', 'no risk', 'secure', 'safe for operations'];

  // Check if the message is asking about districts or areas
  const hasDistrictMention = lowerMessage.includes('district') || lowerMessage.includes('province') || lowerMessage.includes('area') || lowerMessage.includes('region') || lowerMessage.includes('location');

  // Check for highlight intent
  const hasHighlightIntent = highlightKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasSelectIntent = selectKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasDeselectIntent = hasDeselectPhrase || deselectKeywords.some(keyword => lowerMessage.includes(keyword));

  // Check if this is a geographic or risk-related query about the districts
  const isGeographicQuery = hasHighlightIntent || hasSelectIntent || hasDeselectIntent;

  if (isGeographicQuery) {
    // Determine what to highlight
    const criteria = {};

    // Resolve any named admin area first. When the request is scoped to a place
    // ("...within Ituri province"), that area drives the result — we must NOT also
    // expand to "all risk levels", which would match every district in the dataset
    // and act on the whole country instead of just Ituri.
    const matchedAreas = getAdminAreaMatchesFromMessage(message, context);
    const hasScopingPhrase = /\b(within|inside|in|across|of|for)\b[^.?!]*\b(province|territory|territories|region|zone|governorate|state|county|prefecture|district)\b/.test(lowerMessage);
    const hasNamedAreaScope = matchedAreas.length > 0 || hasScopingPhrase;

    // Check for risk level mentions
    if (riskKeywords.some(keyword => lowerMessage.includes(keyword))) {
      // User wants to see high risk areas
      if (lowerMessage.includes('very high')) {
        criteria.riskLevels = ['very-high'];
      } else if (lowerMessage.includes('high')) {
        criteria.riskLevels = ['high', 'very-high'];
      } else if (lowerMessage.includes('no go') || lowerMessage.includes('no-go')) {
        criteria.riskLevels = ['very-high', 'high'];
      } else {
        // Generic "risk" or "risky" - show all at-risk districts
        criteria.riskLevels = ['high', 'very-high', 'medium'];
      }
    }

    if (safeKeywords.some(keyword => lowerMessage.includes(keyword))) {
      // User wants to see safe areas
      criteria.riskLevels = ['none', 'low'];
    }

    // Check for medium risk
    if (lowerMessage.includes('medium risk') || lowerMessage.includes('moderate')) {
      criteria.riskLevels = ['medium'];
    }

    // Check for "all districts" or general area questions — but only as a
    // dataset-wide request. If a specific area was named/scoped, that scope wins.
    if (!hasNamedAreaScope &&
        hasHighlightIntent &&
        (lowerMessage.includes('all') || lowerMessage.includes('entire') || lowerMessage.includes('whole')) &&
        (lowerMessage.includes('district') || lowerMessage.includes('area') || lowerMessage.includes('region'))) {
      // Show all districts regardless of risk
      criteria.riskLevels = ['very-high', 'high', 'medium', 'low', 'none'];
    }

    // Check for event count thresholds
    const eventMatch = lowerMessage.match(/(\d+)\s*(or more|events|incidents)/);
    if (eventMatch) {
      criteria.minEventCount = parseInt(eventMatch[1]);
    }

    if (matchedAreas.length > 0) {
      criteria.ids = matchedAreas.map((area) => area.id).filter((id) => id !== undefined && id !== null);
      criteria.names = matchedAreas.map((area) => area.name || area.matchedValue).filter(Boolean);
      console.log(`📍 Extracted ${matchedAreas.length} district name(s) from message:`, criteria.names);
    }
    const requestedAdminLevel = getRequestedAdminLevel(message);
    if (requestedAdminLevel) {
      criteria.adminLevel = requestedAdminLevel;
    }

    // If we detected some criteria, return the intent
    if (Object.keys(criteria).length > 0) {
      console.log('✅ Map intent detected with criteria:', criteria);
      return {
        action: hasDeselectIntent ? 'deselect_districts' : (hasSelectIntent ? 'select_districts' : 'highlight_districts'),
        criteria: criteria
      };
    }
  }

  const styleCommand = detectAdminStyleCommand(message, context);
  if (styleCommand) {
    return styleCommand;
  }

  return null;
}

function detectAdminDisplayCommand(message = '') {
  const lower = String(message).toLowerCase();
  if (/\b(analysis|scope|selection)\b/.test(lower)) return null;
  const hasAdminLayerTerm = /\b(admin|district|boundary|boundaries|border|borders|outline|outlines|label|labels)\b/.test(lower);
  if (!hasAdminLayerTerm) return null;

  const getTargetVisibility = (targetPattern) => {
    const hidePattern = new RegExp(`\\b(hide|turn off|switch off|disable|remove)\\b[^.?!]{0,60}\\b(${targetPattern})\\b|\\b(${targetPattern})\\b[^.?!]{0,60}\\b(off|hidden|disabled)\\b`);
    const showPattern = new RegExp(`\\b(show|turn on|switch on|enable|display)\\b[^.?!]{0,60}\\b(${targetPattern})\\b|\\b(${targetPattern})\\b[^.?!]{0,60}\\b(on|visible|enabled)\\b`);
    if (hidePattern.test(lower)) return false;
    if (showPattern.test(lower)) return true;
    return null;
  };

  const command = { action: 'set_admin_display' };
  const hasBorderTerm = /\b(border|borders|outline|outlines|boundary line|boundary lines)\b/.test(lower);
  const hasLabelTerm = /\b(label|labels|names)\b/.test(lower);
  const hasBoundaryTerm = /\b(admin layer|admin boundaries|boundaries|boundary layer|district layer)\b/.test(lower) && !hasBorderTerm;
  const borderVisibility = getTargetVisibility('border|borders|outline|outlines|boundary line|boundary lines');
  const labelVisibility = getTargetVisibility('label|labels|names');
  const layerVisibility = getTargetVisibility('admin layer|admin boundaries|boundaries|boundary layer|district layer');

  if (hasBorderTerm && borderVisibility !== null) {
    command.showBorders = borderVisibility;
    command.showLayer = true;
  }

  if (hasLabelTerm && labelVisibility !== null) {
    command.showLabels = labelVisibility;
    command.showLayer = true;
  }

  if (hasBoundaryTerm && layerVisibility !== null) {
    command.showLayer = layerVisibility;
  }

  return Object.keys(command).length > 1 ? command : null;
}

function detectMarkerCommand(message = '', context = {}) {
  const lower = String(message).toLowerCase();
  const wantsMarker = /\b(add|drop|place|put|show|plot|mark)\b/.test(lower) && /\b(pin|marker|dot|point)\b/.test(lower);
  if (!wantsMarker) return null;

  const coordinateMatch =
    String(message).match(/(?:lat(?:itude)?\s*[:=]?\s*)?(-?\d{1,2}(?:\.\d+)?)\s*(?:,|;|\s+)\s*(?:lon(?:gitude)?|lng)\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)/i) ||
    String(message).match(/lat(?:itude)?\s*[:=]?\s*(-?\d{1,2}(?:\.\d+)?)[,\s;]+(?:lon(?:gitude)?|lng)\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)/i) ||
    String(message).match(/\b(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\b/);
  if (!coordinateMatch) {
    const names = getAdminAreaNamesFromMessage(message, context);
    if (!names.length) return null;

    return {
      action: 'add_marker',
      criteria: { names },
      label: names[0]
    };
  }

  const latitude = Number(coordinateMatch[1]);
  const longitude = Number(coordinateMatch[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const labelMatch = String(message).match(/(?:called|named|label(?:ed)?(?:\s+as)?|label)\s+["']?([^"',.]+)["']?/i);
  return {
    action: 'add_marker',
    latitude,
    longitude,
    label: labelMatch?.[1]?.trim() || 'Chat marker',
    color: getRequestedColor(message) || '#2563eb'
  };
}

function detectAdminStyleCommand(message = '', context = {}) {
  const lower = String(message).toLowerCase();
  const fields = Array.isArray(context.adminNumericFields) ? context.adminNumericFields : [];
  if (!context?.hasDistricts) return null;

  const wantsBubbles = /\b(bubble|bubbles|circle|circles|proportional|symbol|symbols)\b/.test(lower);
  const wantsChoropleth = /\b(color|colour|shade|style|choropleth|chlorepleth|fill|heat|gradient)\b/.test(lower);
  const wantsMapMetric = /\b(show|map|display|visualize|plot|make|draw|chart)\b/.test(lower) &&
    /\b(admin|district|districts|area|areas|boundary|boundaries|map|chart|data)\b/.test(lower);
  if (!wantsBubbles && !wantsChoropleth && !wantsMapMetric) return null;

  if (/\b(risk|danger|threat|unsafe|safe)\b/.test(lower) && wantsChoropleth) {
    return { action: 'style_admin_by_risk' };
  }

  if (!fields.length) return null;

  const normalizeToken = (token = '') => String(token).replace(/s$/, '');
  const genericMetricTokens = new Set([
    'site',
    'count',
    'total',
    'case',
    'death',
    'number',
    'value',
    'data'
  ]);
  const messageTokenSet = new Set(
    lower
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .map(normalizeToken)
  );
  const matchedField = fields
    .map((item) => {
    const field = String(item?.field || '').toLowerCase();
    const label = String(item?.label || item?.field || '').toLowerCase();
    const searchableField = `${field} ${label}`;
    const fieldText = field.replace(/[_-]+/g, ' ');
    const fieldTokens = searchableField
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .map(normalizeToken);
    const sharedTokenCount = fieldTokens.filter((token) => messageTokenSet.has(token)).length;
    const strongSharedTokenCount = fieldTokens.filter((token) => (
      messageTokenSet.has(token) && !genericMetricTokens.has(token)
    )).length;
    const exactScore = searchableField.trim() && (
      lower.includes(field) ||
      lower.includes(label) ||
      lower.includes(fieldText)
    ) ? 100 : 0;
    const confident = exactScore > 0 || sharedTokenCount >= 2 || strongSharedTokenCount >= 1;
    return {
      item,
      confident,
      score: exactScore + sharedTokenCount * 10 + Math.min(Number(item?.count) || 0, 5)
    };
  })
    .filter((entry) => entry.confident && entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item || null;

  if (!matchedField) return null;

  if (wantsBubbles) {
    return {
      action: 'style_admin_metric_bubbles',
      metricField: matchedField.field,
      color: getRequestedColor(message)
    };
  }

  return {
    action: 'style_admin_by_metric',
    metricField: matchedField.field,
    palette: getRequestedPalette(message)
  };
}

function getRequestedPalette(message = '') {
  const lower = String(message).toLowerCase();
  const paletteNames = ['red', 'green', 'blue', 'orange', 'purple', 'gray'];
  return paletteNames.find((palette) => lower.includes(palette)) || undefined;
}

function getRequestedColor(message = '') {
  const lower = String(message).toLowerCase();
  const colors = {
    red: '#dc2626',
    green: '#16a34a',
    blue: '#2563eb',
    orange: '#ea580c',
    purple: '#9333ea',
    yellow: '#ca8a04',
    black: '#111827'
  };
  const key = Object.keys(colors).find((color) => lower.includes(color));
  return key ? colors[key] : undefined;
}

function detectOSMCommand(message = '', context = {}) {
  const lower = String(message).toLowerCase();

  // Check for "clear/remove ALL OSM/infrastructure" commands first
  const hasClearVerb = /\b(clear|remove|delete|hide|unload)\b/.test(lower);
  const hasAllOSMPattern = /\b(all|everything)\b/.test(lower) && /\b(osm|openstreetmap|infrastructure|facilities)\b/.test(lower);
  const hasOSMDataPattern = /\b(osm data|osm infrastructure|infrastructure data|infrastructure layers?|osm layers?)\b/.test(lower);

  if (hasClearVerb && (hasAllOSMPattern || hasOSMDataPattern)) {
    return {
      action: 'remove_all_osm',
      category: 'all'
    };
  }

  // OSM category keywords with synonyms - order matters for matching priority
  const osmCategories = {
    hospitals: /\b(hospital|hospitals|clinic|clinics|health center|health centres|health facility|health facilities|medical center|medical centres|healthsite|healthsites)\b/,
    water: /\b(water source|water sources|water point|water points|water station|water stations|water supply|water facilities|well|wells|borehole|boreholes|water)\b/,
    schools: /\b(school|schools|education|educational facility|university|universities|college|colleges|learning center|learning centre)\b/,
    power: /\b(power station|power stations|power plant|power plants|electricity|electric|power line|power lines|electrical grid|substation|substations|power)\b/,
    pharmacies: /\b(pharmacy|pharmacies|drugstore|drugstores|drug store|drug stores|chemist|chemists)\b/,
    airports: /\b(airport|airports|airfield|airfields|airstrip|airstrips|aerodrome|aerodromes|landing strip)\b/,
    roads: /\b(major road|major roads|main road|main roads|highway|highways|motorway|motorways|road|roads|street|streets)\b/,
    fuel: /\b(fuel station|fuel stations|gas station|gas stations|petrol station|petrol stations|filling station|service station|fuel|petrol|gasoline)\b/,
    bridges: /\b(bridge|bridges)\b/
  };

  // Detect which category is mentioned
  const matchedCategory = Object.keys(osmCategories).find(category =>
    osmCategories[category].test(lower)
  );

  if (!matchedCategory) return null;

  // Determine action type
  const hasShowVerb = /\b(show|map|display|add|load|get|fetch|visualize|plot)\b/.test(lower);
  const hasHideVerb = /\b(hide|don't show|stop showing|turn off|switch off)\b/.test(lower);
  const hasRemoveVerb = /\b(remove|delete|clear|unload)\b/.test(lower);

  // Priority: remove > hide > show
  if (hasRemoveVerb) {
    return {
      action: 'remove_osm_layer',
      category: matchedCategory
    };
  }

  if (hasHideVerb) {
    return {
      action: 'hide_osm_layer',
      category: matchedCategory
    };
  }

  if (hasShowVerb || /\b(all|the)\b/.test(lower)) {
    return {
      action: 'show_osm_layer',
      category: matchedCategory
    };
  }

  return null;
}

function getAdminAreaNamesFromMessage(message = '', context = {}) {
  return getAdminAreaMatchesFromMessage(message, context)
    .map((match) => match.matchedValue || match.name);
}

function getAdminAreaMatchesFromMessage(message = '', context = {}) {
  const normalizedMessage = String(message).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const areas = Array.isArray(context.adminAreas) ? context.adminAreas : [];
  const matches = [];
  const requestedLevel = getRequestedAdminLevel(message);
  const genericAdminTokens = new Set([
    'admin',
    'area',
    'areas',
    'boundary',
    'boundaries',
    'district',
    'districts',
    'province',
    'provinces',
    'region',
    'regions',
    'territory',
    'territories',
    'health',
    'zone',
    'zones',
    'sud',
    'nord',
    'est',
    'ouest',
    'north',
    'south',
    'east',
    'west',
    'central',
    'highlight',
    'show',
    'map'
  ]);

  // Parent-scope pass: "highlight districts IN Ituri" names an output level AND a
  // parent scope. Match the parent name against EVERY identity entry so we return
  // all child areas whose parent is that place, whether or not the user said
  // "province". Mirrors the client resolver in ChatDrawer.js.
  const scopeMatch = normalizedMessage.match(/\b(?:in|within|inside|across|of|for|under)\s+(.+)$/);
  if (scopeMatch) {
    const scopeText = scopeMatch[1]
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !genericAdminTokens.has(token))
      .join(' ')
      .trim();
    if (scopeText.length >= 3) {
      const parentMatches = areas
        .map((area) => {
          const identityValues = Array.isArray(area?.identityEntries)
            ? area.identityEntries.map((entry) => entry.value)
            : [];
          const allCandidates = [area?.region, area?.country, ...identityValues].filter(Boolean);
          const matchedCandidate = allCandidates.find((candidate) => {
            const normalized = String(candidate).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            return normalized.length >= 3 && (
              normalizedTextContains(scopeText, normalized) ||
              normalizedTextContains(normalized, scopeText)
            );
          });
          return matchedCandidate ? { ...area, matchedValue: String(matchedCandidate) } : null;
        })
        .filter(Boolean);

      if (parentMatches.length > 1) {
        return Array.from(
          new Map(parentMatches.map((match) => [String(match.id ?? match.name), match])).values()
        ).slice(0, MAX_ADMIN_AREA_MATCHES);
      }
    }
  }

  areas.forEach((area) => {
    const identityEntries = Array.isArray(area?.identityEntries) ? area.identityEntries : [];
    const levelEntries = requestedLevel
      ? identityEntries.filter((entry) => {
          if (requestedLevel === 'province') return entry.level === 'province';
          if (requestedLevel === 'district') return entry.level === 'district' || entry.level === 'name';
          if (requestedLevel === 'health_zone') return entry.level === 'health_zone' || entry.level === 'name';
          return true;
        })
      : identityEntries;
    const candidates = (levelEntries.length ? levelEntries.map((entry) => entry.value) : [
      area?.name,
      area?.country,
      area?.region,
      ...(Array.isArray(area?.aliases) ? area.aliases : [])
    ]).filter(Boolean);

    const matchedCandidate = candidates.find((candidate) => {
      const normalized = String(candidate).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const normalizedLoose = normalizeAdminNameForMatch(candidate);
      const messageLoose = normalizeAdminNameForMatch(message);
      return normalized.length >= 3 && (
        normalizedTextContains(normalizedMessage, normalized) ||
        normalizedTextContains(messageLoose, normalizedLoose)
      );
    });

    if (matchedCandidate) {
      matches.push({ ...area, matchedValue: String(matchedCandidate) });
      return;
    }

    if (requestedLevel && levelEntries.length) return;

    const messageTokens = normalizedMessage
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !genericAdminTokens.has(token));
    const searchText = requestedLevel && levelEntries.length
      ? String(levelEntries.map((entry) => entry.value).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      : String(area?.searchText || '');
    const tokenMatch = messageTokens.find((token) => normalizedTextContains(searchText, token));
    if (tokenMatch) {
      matches.push({ ...area, matchedValue: tokenMatch });
    }
  });

  return Array.from(
    new Map(matches.map((match) => [String(match.id ?? match.name), match])).values()
  )
    .filter((match) => {
      const normalized = String(match.matchedValue || match.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return normalized.length >= 3;
    })
    .slice(0, MAX_ADMIN_AREA_MATCHES);
}

function normalizedTextContains(searchText = '', term = '') {
  const normalizedSearchText = String(searchText).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedTerm = String(term).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalizedSearchText || !normalizedTerm) return false;
  return ` ${normalizedSearchText} `.includes(` ${normalizedTerm} `);
}

function normalizeAdminNameForMatch(value = '') {
  const adminTypeWords = new Set([
    'admin',
    'area',
    'areas',
    'boundary',
    'boundaries',
    'district',
    'districts',
    'province',
    'provinces',
    'region',
    'regions',
    'territory',
    'territories'
  ]);

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !adminTypeWords.has(token))
    .join(' ')
    .trim();
}

function getRequestedAdminLevel(message = '') {
  const lower = String(message).toLowerCase();
  if (/\b(province|provinces|adm1|admin 1|admin1)\b/.test(lower)) return 'province';
  if (/\b(health zone|health zones|zone de sante|zscode)\b/.test(lower)) return 'health_zone';
  if (/\b(district|districts|territory|territories|adm2|admin 2|admin2)\b/.test(lower)) return 'district';
  return '';
}

function tokenizeForMatching(message = '') {
  return String(message)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function isGenericFollowUp(message = '') {
  const lower = String(message).toLowerCase();
  return (
    lower.includes('what happened') ||
    lower.includes('who are the actors') ||
    lower.includes('who were the actors') ||
    lower.includes('what happened exactly') ||
    lower.includes('exactly') ||
    lower.includes('tell me more') ||
    lower.includes('more detail') ||
    lower.includes('more details') ||
    lower.includes('what about this') ||
    lower.includes('and this') ||
    lower.includes('any air/drone strikes')
  );
}

function buildDeepAnchorText(message = '', conversationHistory = []) {
  const recentHistory = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-4).map((item) => item?.content || '').join(' ')
    : '';

  return isGenericFollowUp(message)
    ? `${recentHistory} ${message}`
    : message;
}

function scoreAcledEventMatch(event = {}, tokens = []) {
  const haystack = [
    event.event_type,
    event.sub_event_type,
    event.location,
    event.admin1,
    event.admin2,
    event.admin3,
    event.country,
    event.actor1,
    event.actor2,
    event.notes,
    event.source,
    event.event_date
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function buildDeepContextSummary(context, message, conversationHistory = []) {
  const sections = [];
  const anchorText = buildDeepAnchorText(message, conversationHistory);
  const tokens = tokenizeForMatching(anchorText);
  const lowerAnchorText = String(anchorText).toLowerCase();
  const deepAcledData = context?.acledDeepPool?.length ? context.acledDeepPool : context?.acledData;

  if (/\bairport\b|\bairports\b|\bairfield\b|\bhelipad\b|\baerodrome\b|\binternational airport\b|\bairbase\b/.test(lowerAnchorText)) {
    const airportMatches = buildAirportEventMatches({
      ...context,
      acledData: deepAcledData
    }, tokens);

    if (airportMatches.length > 0) {
      sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      sections.push('DEEP AIRPORT PROXIMITY CONTEXT');
      sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      airportMatches.slice(0, 5).forEach((match, index) => {
        sections.push(`Match ${index + 1}: ${match.event.event_type || 'Unknown'} near ${match.airport.name || 'Unnamed airport'} (${match.distanceKm.toFixed(1)} km)`);
        sections.push(`Date: ${match.event.event_date || 'Unknown date'}`);
        sections.push(`Location: ${match.event.location || 'Unknown location'}${match.event.country ? ` (${match.event.country})` : ''}`);
        if (match.event.sub_event_type) sections.push(`Subtype: ${match.event.sub_event_type}`);
        if (match.event.actor1) sections.push(`Actor 1: ${match.event.actor1}`);
        if (match.event.actor2) sections.push(`Actor 2: ${match.event.actor2}`);
        if (match.event.notes) sections.push(`Details: ${match.event.notes}`);
        if (match.event.source) sections.push(`Source: ${match.event.source}`);
        sections.push('');
      });
    }
  }

  if (deepAcledData?.length) {
    const matchedEvents = deepAcledData
      .map((event) => ({ event, score: scoreAcledEventMatch(event, tokens) }))
      .filter(({ score, event }) => score > 0 || (!tokens.length && (event.notes || event.actor1 || event.source)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ event }) => event);

    if (matchedEvents.length > 0) {
      sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      sections.push('DEEP ACLED EVENT CONTEXT');
      sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      matchedEvents.forEach((event, index) => {
        sections.push(`Event ${index + 1}: ${event.event_type || 'Unknown'} | ${event.sub_event_type || 'No subtype'} | ${event.location || 'Unknown location'} | ${event.event_date || 'Unknown date'}`);
        if (event.actor1) sections.push(`Actor 1: ${event.actor1}`);
        if (event.actor2) sections.push(`Actor 2: ${event.actor2}`);
        if (typeof event.fatalities === 'number') sections.push(`Fatalities: ${event.fatalities}`);
        if (event.notes) sections.push(`Detailed notes: ${event.notes}`);
        if (event.source) sections.push(`Source detail: ${event.source}`);
        if (event.event_id) sections.push(`Event ID: ${event.event_id}`);
        sections.push('');
      });
    }
  }

  if (context?.selectedFacility && context?.selectedFacilityImpacts?.length) {
    sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    sections.push('DEEP FACILITY CONTEXT');
    sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    sections.push(`Selected facility: ${context.selectedFacility.name}`);
    context.selectedFacilityImpacts.slice(0, 5).forEach((impact, index) => {
      sections.push(`Impact ${index + 1}: ${impact?.disaster?.eventType || 'Unknown'} | ${impact?.disaster?.title || impact?.disaster?.eventName || 'Unnamed event'} | ${impact?.distance ?? 'Unknown'} km`);
    });
  }

  return sections.join('\n');
}

function getFeatureReferencePoint(feature = null) {
  const geometry = feature?.geometry;
  if (!geometry?.type || !geometry?.coordinates) return null;

  if (geometry.type === 'Point') {
    return { latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] };
  }

  if (geometry.type === 'Polygon') {
    const coord = geometry.coordinates?.[0]?.[0];
    return coord ? { latitude: coord[1], longitude: coord[0] } : null;
  }

  if (geometry.type === 'MultiPolygon') {
    const coord = geometry.coordinates?.[0]?.[0]?.[0];
    return coord ? { latitude: coord[1], longitude: coord[0] } : null;
  }

  return null;
}

function buildAirportEventMatches(context = {}, tokens = []) {
  const airports = (context?.osmData?.features || []).filter((feature) => feature?.properties?.category === 'airport');
  const acledEvents = context?.acledData || [];

  if (!acledEvents.length) return [];

  const airportPoints = airports
    .map((airport) => ({
      airport,
      point: getFeatureReferencePoint(airport)
    }))
    .filter((item) => item.point);

  const matches = [];
  const seenKeys = new Set();

  acledEvents.forEach((event) => {
    if (event?.latitude === undefined || event?.longitude === undefined) return;

    const eventKey = event?.event_id || `${event?.event_date || ''}:${event?.location || ''}:${event?.event_type || ''}`;
    const airportText = [
      event?.location,
      event?.admin1,
      event?.admin2,
      event?.admin3,
      event?.sub_event_type,
      event?.notes
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const mentionsAirport =
      airportText.includes('airport') ||
      airportText.includes('airbase') ||
      airportText.includes('air field') ||
      airportText.includes('airfield') ||
      airportText.includes('aerodrome') ||
      airportText.includes('helipad');

    const matchScore = scoreAcledEventMatch(event, tokens);

    if (mentionsAirport && !seenKeys.has(`${eventKey}:text`)) {
      matches.push({
        event,
        airport: {
          name: event?.location || 'Airport-linked location',
          aeroway: 'text-match'
        },
        distanceKm: 0,
        score: 100 + matchScore
      });
      seenKeys.add(`${eventKey}:text`);
    }

    airportPoints.forEach(({ airport, point }) => {
      const distanceKm = getDistance(
        { latitude: parseFloat(event.latitude), longitude: parseFloat(event.longitude) },
        point
      ) / 1000;

      if (distanceKm <= 25) {
        const proximityKey = `${eventKey}:${airport?.properties?.name || airport?.id || 'airport'}`;
        if (seenKeys.has(proximityKey)) return;

        matches.push({
          event,
          airport: {
            name: airport?.properties?.name || airport?.properties?.tags?.name || 'Unnamed airport',
            aeroway: airport?.properties?.tags?.aeroway || null
          },
          distanceKm,
          score: Math.max(1, 25 - distanceKm) + matchScore
        });
        seenKeys.add(proximityKey);
      }
    });
  });

  return matches.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return a.distanceKm - b.distanceKm;
  });
}

function buildContextSummary(context) {
  if (!context) return "No context available.";

  let summary = [];

  if (Array.isArray(context.chatAttachments) && context.chatAttachments.length > 0) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`USER-ATTACHED CHAT DATASETS`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`These files were uploaded by the user into the chat. They are chat context only unless the user explicitly asks to prepare them for workspace/site upload.`);
    summary.push(`Infer the dataset purpose from its filename, columns, and sample rows. Use it for schema review, data cleaning advice, analysis, and upload-preparation guidance based on the fields actually present. Do not assume it is health, VPD, CBS, RCCE, site, or surveillance data unless the attached fields support that. Do not claim it is already mapped as workspace sites unless the workspace facility context also includes it.`);

    context.chatAttachments.slice(0, 3).forEach((attachment, attachmentIndex) => {
      const attachmentKind = attachment.attachmentKind || 'dataset';
      summary.push(`\nAttachment ${attachmentIndex + 1}: ${attachment.fileName || 'Unnamed file'}`);
      if (attachmentKind === 'document') {
        const stats = attachment.documentStats || {};
        summary.push(`Type: ${attachment.fileType || 'unknown'} document | Extracted words: ${stats.wordCount || 0} | Extracted characters: ${stats.characterCount || 0}${stats.pageCount ? ` | Pages: ${stats.pageCount}` : ''}${stats.truncated ? ' | Text was truncated for chat context' : ''}`);
        summary.push('This is an extracted-text document attachment. Use it for summarization, question answering, cross-checking against workspace data, and identifying possible entities or indicators. Do not treat it as a structured workspace dataset unless the user asks to extract and prepare tabular data from it.');

        if (Array.isArray(attachment.documentChunks) && attachment.documentChunks.length > 0) {
          summary.push(`Document excerpts (${attachment.documentChunks.length} chunks):`);
          attachment.documentChunks.slice(0, 8).forEach((chunk, index) => {
            summary.push(`Chunk ${chunk.index || index + 1}: ${chunk.text}`);
          });
        }

        return;
      }

      summary.push(`Type: ${attachment.fileType || 'unknown'} | Rows: ${attachment.rowCount || 0} | Columns: ${attachment.columns?.length || 0}`);
      if (attachment.retainedRowCount && attachment.retainedRowCount < attachment.rowCount) {
        summary.push(`Client retained rows for local processing: ${attachment.retainedRowCount}. Chat context includes a bounded sample only.`);
      }
      if (attachment.promoteCandidate) {
        summary.push(`Potential workspace upload candidate: yes, latitude/longitude-like fields were detected.`);
      }
      if (attachment.mappings) {
        summary.push(`Detected field mapping candidates: ${JSON.stringify(attachment.mappings)}`);
      }
      if (Array.isArray(attachment.columns) && attachment.columns.length > 0) {
        summary.push(`Columns: ${attachment.columns.slice(0, 80).join(', ')}`);
      }
      if (Array.isArray(attachment.columnSummary) && attachment.columnSummary.length > 0) {
        summary.push(`Column examples:`);
        attachment.columnSummary.slice(0, 20).forEach((column) => {
          summary.push(`- ${column.name}: filled ${column.filledRows || 0}; examples ${Array.isArray(column.examples) ? column.examples.join(' | ') : ''}`);
        });
      }
      if (Array.isArray(attachment.rows) && attachment.rows.length > 0) {
        summary.push(`Sample rows (${attachment.rows.length}):`);
        attachment.rows.slice(0, 30).forEach((row, index) => {
          summary.push(`${index + 1}. ${JSON.stringify(row)}`);
        });
      }
    });
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (Array.isArray(context.mentionedAdminAreas) && context.mentionedAdminAreas.length > 0) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`MENTIONED ADMIN AREA FULL ATTRIBUTES`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`The user mentioned these uploaded admin areas in the current message. Use these exact key-value attributes to answer field-specific questions. If a requested metric appears here, answer from this section rather than saying the data is unavailable.`);

    context.mentionedAdminAreas.forEach((area, index) => {
      summary.push(`\n${index + 1}. ${area.name}${area.region ? ` | region ${area.region}` : ''}${area.country ? ` | country ${area.country}` : ''}`);
      if (area.matchedValue && area.matchedValue !== area.name) {
        summary.push(`Matched user term: ${area.matchedValue}`);
      }
      if (Array.isArray(area.attributes) && area.attributes.length > 0) {
        area.attributes.forEach((attribute) => {
          summary.push(`- ${attribute.label}: ${attribute.value}`);
        });
      }
    });

    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (context.selectedAnalysisDistricts && context.selectedAnalysisDistricts.length > 0) {
    const selectedNames = context.selectedAnalysisDistricts
      .map((district) => district.name)
      .filter(Boolean);

    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`ACTIVE ADMIN-AREA SELECTION`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`Selected Districts: ${context.selectedAnalysisDistricts.length}`);
    if (selectedNames.length > 0) {
      summary.push(`Names: ${selectedNames.join(', ')}`);
    }
    summary.push(`⚡ IMPORTANT: These selected districts are the user's current analysis scope.`);
    summary.push(`   For district- or admin-level questions, prioritize this selection over the full uploaded shapefile.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (context.activeDistrictSummary) {
    const d = context.activeDistrictSummary;
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`${d.isSelectedScope ? 'ACTIVE SCOPE DISTRICT RISK ASSESSMENT' : 'CURRENT DISTRICT RISK ASSESSMENT'}`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`Admin areas in scope: ${d.totalCount}`);
    summary.push(`Very High Risk: ${d.riskBreakdown['very-high']}`);
    summary.push(`High Risk: ${d.riskBreakdown.high}`);
    summary.push(`Medium Risk: ${d.riskBreakdown.medium}`);
    summary.push(`Low Risk: ${d.riskBreakdown.low}`);
    summary.push(`No Risk: ${d.riskBreakdown.none}`);

    if (Array.isArray(d.rankedDistricts) && d.rankedDistricts.length > 0) {
      summary.push(`Highest-risk districts in current scope:`);
      d.rankedDistricts.slice(0, 5).forEach((district, index) => {
        summary.push(`- ${index + 1}. ${district.name} | ${district.level} risk | score ${district.score} | ACLED ${district.acledCount} | GDACS ${district.disasterCount}`);
      });
    }

    if ((!Array.isArray(context.selectedAnalysisDistricts) || context.selectedAnalysisDistricts.length === 0) && Array.isArray(d.attributeSamples) && d.attributeSamples.length > 0) {
      summary.push(`\nSample user-uploaded admin attributes from the boundary file:`);
      d.attributeSamples.slice(0, 5).forEach((sample) => {
        summary.push(`- ${sample.name}:`);
        (sample.attributes || []).slice(0, 12).forEach((attribute) => {
          summary.push(`  - ${attribute.label}: ${attribute.value}`);
        });
      });
      summary.push(`These are bounded samples only. Infer meaning from field names and values; do not assume a fixed GeoJSON or shapefile schema.`);
    }

    if (Array.isArray(context.selectedAnalysisDistricts) && context.selectedAnalysisDistricts.length > 0) {
      summary.push(`\nUser-uploaded admin attributes for selected areas:`);
      context.selectedAnalysisDistricts.slice(0, 8).forEach((district, index) => {
        const attributes = Array.isArray(district.adminAttributes) && district.adminAttributes.length > 0
          ? district.adminAttributes
          : summarizeDistrictAttributes(district, { maxFields: 25, maxDepth: 3 });
        summary.push(`- ${district.name || `Selected Area ${index + 1}`}:`);
        attributes.slice(0, 25).forEach((attribute) => {
          summary.push(`  - ${attribute.label}: ${attribute.value}`);
        });
      });
      summary.push(`Use these uploaded attributes when relevant. Infer their meaning from field names and values; do not assume a fixed GeoJSON or shapefile schema.`);
    }

    summary.push(`⚡ IMPORTANT: Use this active-scope district ranking when the user asks which districts to avoid, monitor, prioritize, or treat as unsafe.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (Array.isArray(context.adminAreas) && context.adminAreas.length > 0) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`FULL UPLOADED ADMIN AREA INDEX`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`Admin areas indexed: ${context.adminAreas.length}`);
    summary.push(`Use this full index for questions about whether a province, district, territory, health zone, or other admin subdivision exists in the uploaded boundaries. Do not say an area is missing unless it is absent from this full index.`);
    summary.push(`Each row lists the area name and, when available, its parent province and admin level. When asked which districts belong to a province, list EVERY row whose province matches — do not rely on memory or guess which places belong where.`);
    summary.push(`Names and hierarchy:`);
    const getIdentityValue = (area, level) => {
      if (!Array.isArray(area.identityEntries)) return null;
      const entry = area.identityEntries.find((item) => item && item.level === level && item.value);
      return entry ? String(entry.value).trim() : null;
    };
    context.adminAreas.slice(0, 1200).forEach((area, index) => {
      const aliases = Array.isArray(area.aliases)
        ? area.aliases
            .filter((alias) => alias && alias !== area.name)
            .slice(0, 8)
        : [];
      // Prefer the explicit province identity from the uploaded attributes so the
      // model can group districts by province deterministically (region is a
      // looser, sometimes-empty fallback).
      const province = getIdentityValue(area, 'province') || area.region || null;
      const districtName = getIdentityValue(area, 'district');
      const healthZone = getIdentityValue(area, 'health_zone');
      summary.push(
        `${index + 1}. ${area.name}` +
        `${province ? ` | province ${province}` : ''}` +
        `${districtName && districtName !== area.name ? ` | district ${districtName}` : ''}` +
        `${healthZone && healthZone !== area.name ? ` | health zone ${healthZone}` : ''}` +
        `${area.country ? ` | country ${area.country}` : ''}` +
        `${aliases.length ? ` | aliases ${aliases.join(' / ')}` : ''}`
      );
    });
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (
    context.activeMapLayer ||
    typeof context.nighttimeLightsLoaded === 'boolean' ||
    (Array.isArray(context.enabledEvidenceLayers) && context.enabledEvidenceLayers.length > 0)
  ) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`ACTIVE MAP AND EVIDENCE LAYERS`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (context.activeMapLayerName) {
      summary.push(`Active map layer: ${context.activeMapLayerName}`);
    } else if (context.activeMapLayer) {
      summary.push(`Active map layer: ${context.activeMapLayer}`);
    }

    if (context.nighttimeLightsLoaded || context.activeMapLayer === 'nighttime_lights') {
      summary.push(`Nighttime lights: loaded`);
      summary.push(`Use: contextual evidence for population concentration, settlement footprint, infrastructure concentration, and broad electrification patterns.`);
      summary.push(`Limits: do not infer real-time outages, direct damage, or service failure from this layer alone.`);
    } else {
      summary.push(`Nighttime lights: not loaded`);
      summary.push(`If nighttime-light context would help, ask the user to switch the map layer to Nighttime Lights (GEE).`);
    }

    if (context.activeMapLayerNote) {
      summary.push(`Layer note: ${context.activeMapLayerNote}`);
    }

    if (Array.isArray(context.enabledEvidenceLayers) && context.enabledEvidenceLayers.includes('accessibility_context')) {
      summary.push(`Accessibility context: loaded`);
      summary.push(`Use: modeled travel time to healthcare for hard-to-reach and access-friction context.`);
      summary.push(`Limits: do not treat this layer as direct proof of current road closures, live passability, or convoy clearance.`);
    }

    if (Array.isArray(context.enabledEvidenceLayers) && context.enabledEvidenceLayers.length > 0) {
      summary.push(`Enabled evidence layers: ${context.enabledEvidenceLayers.join(', ')}`);
    }

    summary.push(`⚡ IMPORTANT: If a layer is listed here, it is loaded in the user's workspace and may be referenced with appropriate limits.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // Site information
  if (context.selectedFacility) {
    summary.push(`SELECTED SITE: ${context.selectedFacility.name}`);
    if (context.selectedFacility.type) {
      summary.push(`Type: ${context.selectedFacility.type}`);
    }
    summary.push(`Location: ${context.selectedFacility.latitude}, ${context.selectedFacility.longitude}`);

    // Include custom fields from uploaded data
    if (context.selectedFacility.customFields) {
      summary.push('\nAdditional Site Information:');
      Object.entries(context.selectedFacility.customFields).forEach(([key, value]) => {
        summary.push(`- ${key}: ${value}`);
      });
    }
  }

  // Sites overview
  if (context.totalFacilities) {
    summary.push(`\nTOTAL SITES: ${context.totalFacilities}`);

    // Include sites list (compact format for 200 entries)
    if (context.facilities && context.facilities.length > 0) {
      const totalCount = context.totalFacilities;
      const shownCount = context.facilities.length;

      const aiAnalysisFields = context.aiAnalysisFields || [];

      // Debug logging
      console.log('Building site list with AI fields:', aiAnalysisFields);
      if (context.facilities.length > 0) {
        console.log('Sample site keys:', Object.keys(context.facilities[0]));
      }

      if (aiAnalysisFields.length > 0) {
        summary.push(`\n📊 SITES DATABASE WITH AI ANALYSIS DATA (showing ${shownCount} of ${totalCount}):`);
        summary.push(`   The following fields are included for each site: ${aiAnalysisFields.join(', ')}`);
      } else {
        summary.push(`\nSITES DATABASE (showing ${shownCount} of ${totalCount}):`);
      }

      // Compact one-line format for each site
      context.facilities.forEach((facility, idx) => {
        const parts = [`${idx + 1}. ${facility.name}`];

        // Add location (abbreviated)
        if (facility.latitude && facility.longitude) {
          parts.push(`@ ${parseFloat(facility.latitude).toFixed(2)},${parseFloat(facility.longitude).toFixed(2)}`);
        }

        // Add type if available
        if (facility.type) {
          parts.push(`[${facility.type}]`);
        }

        // Add country
        if (facility.country) {
          parts.push(`(${facility.country})`);
        }

        // Add ALL analysis fields (not just first 2) to ensure AI has complete data
        aiAnalysisFields.forEach(field => {
          if (facility[field] !== undefined && facility[field] !== null && facility[field] !== '') {
            const val = String(facility[field]).length > 30
              ? String(facility[field]).substring(0, 27) + '...'
              : facility[field];
            parts.push(`${field}=${val}`);
          }
        });

        summary.push(parts.join(' | '));
      });

      if (totalCount > shownCount) {
        summary.push(`\n[${totalCount - shownCount} additional sites not shown]`);
      }

      if (aiAnalysisFields.length > 0) {
        summary.push(`\n📊 AI ANALYSIS FIELDS LOADED FOR ALL SITES:`);
        summary.push(`   Fields available: ${aiAnalysisFields.join(', ')}`);
        summary.push(`   ✅ The data from these fields is included in each site listing above`);
        summary.push(`   You can analyze trends, identify patterns, and answer questions about these field values`);
      }
    }
  }

  // Weather forecast information
  if (context.weatherForecast) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`WEATHER FORECAST DATA`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Regional forecast (Option 1)
    if (context.weatherForecast.regional) {
      const regional = context.weatherForecast.regional;
      summary.push(`\n🌤️ REGIONAL FORECAST (Operational Area):`);
      summary.push(`   Location: ${regional.location || 'Center of facility area'}`);
      summary.push(`   Coordinates: ${regional.latitude?.toFixed(2)}°, ${regional.longitude?.toFixed(2)}°`);
      summary.push(`   Forecast Period: Next ${regional.forecastDays} days`);

      if (regional.summary) {
        summary.push(`\n   📊 7-Day Summary:`);
        summary.push(`   • Total Rainfall: ${regional.summary.totalRainfall}mm`);
        summary.push(`   • Peak Rainfall: ${regional.summary.peakRainfall}mm (${regional.summary.peakRainfallDay})`);
        summary.push(`   • Temperature Range: ${regional.summary.minTemp}°C to ${regional.summary.maxTemp}°C`);
        summary.push(`   • Avg Wind Speed: ${regional.summary.avgWindSpeed} km/h`);
        summary.push(`   • Avg Humidity: ${regional.summary.avgHumidity}%`);
      }

      if (regional.warnings && regional.warnings.length > 0) {
        summary.push(`\n   ⚠️ WEATHER WARNINGS:`);
        regional.warnings.forEach(warning => {
          summary.push(`   • ${warning}`);
        });
      }

      if (regional.operationalImplications && regional.operationalImplications.length > 0) {
        summary.push(`\n   💡 Operational Implications:`);
        regional.operationalImplications.forEach(implication => {
          summary.push(`   • ${implication}`);
        });
      }
    }

    // District-level forecasts (Option 3)
    if (context.weatherForecast.districts && context.weatherForecast.districts.length > 0) {
      summary.push(`\n🗺️ DISTRICT-LEVEL WEATHER FORECASTS:`);
      summary.push(`   Showing weather for ${context.weatherForecast.districts.length} districts`);

      context.weatherForecast.districts.forEach(dist => {
        const warnings = dist.warnings && dist.warnings.length > 0
          ? ` ⚠️ ${dist.warnings.join(', ')}`
          : '';
        summary.push(`   • ${dist.name}: ${dist.totalRainfall}mm rain, ${dist.avgTemp}°C${warnings}`);
      });
    }

    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // WorldPop population data
  if (context.worldPopData && Object.keys(context.worldPopData).length > 0) {
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`WORLDPOP POPULATION DATA (${context.worldPopYear || 'Year Unknown'})`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Calculate totals
    const totalPop = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.total || 0), 0);
    const under5 = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.under5 || 0), 0);
    const age5_14 = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.age5_14 || 0), 0);
    const age15_49 = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.age15_49 || 0), 0);
    const age50_59 = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.age50_59 || 0), 0);
    const over60 = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.age60plus || 0), 0);
    const female = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.female || 0), 0);
    const male = Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.male || 0), 0);
    const sexByAgeGroups = [
      ['Under 5', 'under5'],
      ['Age 5-14', 'age5_14'],
      ['Age 15-49', 'age15_49'],
      ['Age 50-59', 'age50_59'],
      ['Age 60+', 'age60plus'],
    ].map(([label, key]) => ({
      label,
      female: Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.[`${key}Female`] || 0), 0),
      male: Object.values(context.worldPopData).reduce((sum, d) => sum + (d.ageGroups?.[`${key}Male`] || 0), 0),
    })).filter((group) => group.female > 0 || group.male > 0);

    summary.push(`\n📊 POPULATION OVERVIEW:`);
    summary.push(`   Total Population: ${totalPop.toLocaleString()}`);
    summary.push(`   Data Source: WorldPop ${context.worldPopYear || 'data'} via Google Earth Engine`);
    summary.push(`   Coverage: ${Object.keys(context.worldPopData).length} district(s)`);

    // Check if we have age breakdown data
    const hasAgeBreakdown = under5 > 0 || age5_14 > 0 || age15_49 > 0;

    if (hasAgeBreakdown) {
      summary.push(`\n   📈 AGE GROUP BREAKDOWN:`);
      summary.push(`   • Under 5: ${under5.toLocaleString()} (${Math.round((under5/totalPop)*100)}%)`);
      summary.push(`   • Age 5-14: ${age5_14.toLocaleString()} (${Math.round((age5_14/totalPop)*100)}%)`);
      summary.push(`   • Age 15-49: ${age15_49.toLocaleString()} (${Math.round((age15_49/totalPop)*100)}%)`);
      summary.push(`   • Age 50-59: ${age50_59.toLocaleString()} (${Math.round((age50_59/totalPop)*100)}%)`);
      summary.push(`   • Age 60+: ${over60.toLocaleString()} (${Math.round((over60/totalPop)*100)}%)`);

      if (female > 0 || male > 0) {
        summary.push(`\n   👥 GENDER BREAKDOWN:`);
        summary.push(`   • Female: ${female.toLocaleString()} (${Math.round((female/totalPop)*100)}%)`);
        summary.push(`   • Male: ${male.toLocaleString()} (${Math.round((male/totalPop)*100)}%)`);
      }

      if (sexByAgeGroups.length > 0) {
        summary.push(`\n   👥 SEX BY AGE BREAKDOWN:`);
        sexByAgeGroups.forEach((group) => {
          summary.push(`   • ${group.label}: ${group.female.toLocaleString()} female, ${group.male.toLocaleString()} male`);
        });
      }

      const vulnerable = under5 + over60;
      summary.push(`\n   ⚠️ VULNERABLE POPULATIONS:`);
      summary.push(`   • Total Vulnerable (Under 5 + Over 60): ${vulnerable.toLocaleString()} (${Math.round((vulnerable/totalPop)*100)}%)`);
      summary.push(`   • Children Under 5: ${under5.toLocaleString()}`);
      summary.push(`   • Elderly 60+: ${over60.toLocaleString()}`);
    }

    // Add detailed district breakdown if districts are available
    if (context.districtsForWorldPop && context.districtsForWorldPop.length > 0) {
      const formattedData = formatWorldPopForAI(context.worldPopData, context.districtsForWorldPop, context.worldPopYear || 'unknown');
      summary.push(formattedData);
    }

    summary.push(`\n⚡ IMPORTANT: This population data is LOADED IN YOUR CONTEXT. Always use this data when answering population-related questions.`);
    summary.push(`   DO NOT search the web for population statistics when this data is available.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // OpenStreetMap Infrastructure Data
  if (context.osmData && context.osmData.features && context.osmData.features.length > 0) {
    console.log('✅ Adding OSM data to context:', context.osmData.features.length, 'features');

    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`🏗️ OPENSTREETMAP INFRASTRUCTURE DATA`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const formattedOSM = formatOSMForAI(context.osmData, context.disasters || []);
    summary.push(formattedOSM);

    summary.push(`\n⚡ IMPORTANT: This infrastructure data is LOADED IN YOUR CONTEXT from OpenStreetMap.`);
    summary.push(`   Use this data when discussing:`);
    summary.push(`   - Healthcare access (hospitals, clinics, pharmacies)`);
    summary.push(`   - Education facilities (schools)`);
    summary.push(`   - Essential services (water points, power stations, fuel)`);
    summary.push(`   - Transportation (roads, bridges, airports)`);
    summary.push(`   - Campaign logistics and accessibility`);
    summary.push(`   DO NOT search the web for infrastructure data when this information is available.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  } else {
    console.log('❌ OSM data NOT added to context:', {
      hasOsmData: !!context.osmData,
      hasFeatures: !!context.osmData?.features,
      featuresLength: context.osmData?.features?.length
    });
  }

  if (context.prioritizationBoard?.districtRows?.length > 0) {
    const board = context.prioritizationBoard;
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`PRIORITIZATION BOARD (Latest Generated Decision Layer)`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`Scope: ${board.summary?.selectedAreaCount || board.districtRows.length} admin area(s)`);
    summary.push(`Score bands: Urgent 75-100 | High 55-74 | Medium 35-54 | Monitor 0-34`);
    summary.push(`Urgent Areas: ${board.districtRows.filter((row) => row.priorityLevel === 'Urgent').length}`);
    summary.push(`High Areas: ${board.districtRows.filter((row) => row.priorityLevel === 'High').length}`);
    if (board.summary?.districtHazardSummary?.sources?.length) {
      summary.push(`Hazard evidence sources: ${board.summary.districtHazardSummary.sources.join(' | ')}`);
    }

    summary.push(`\nTOP PRIORITIZED ADMIN LEVELS:`);
    board.districtRows.slice(0, 5).forEach((row) => {
      summary.push(`- Rank ${row.rank}: ${row.district}`);
      summary.push(`  Priority: ${row.priorityLevel} (score ${row.priorityScore}/100)`);
      if (row.posture) summary.push(`  Posture: ${row.posture}`);
      if (typeof row.projectedHazardScore === 'number') {
        summary.push(`  Projected hazard: ${row.projectedHazardType} ${row.projectedHazardLevel} (${row.projectedHazardScore}/100)`);
      }
      if (row.projectedResponseScale) {
        summary.push(`  Response scale: ${row.projectedResponseScale}`);
      }
      if (row.projectedEvidenceBase) {
        summary.push(`  Evidence base: ${row.projectedEvidenceBase}`);
      }
      if (row.projectedTopDrivers?.length) {
        summary.push(`  Top projected drivers: ${row.projectedTopDrivers.map((driver) => `${driver.label}${driver.value !== null && driver.value !== undefined ? ` (${driver.value}${driver.unit ? ` ${driver.unit}` : ''})` : ''}`).join(' | ')}`);
      }
      if (row.recommendedAction) summary.push(`  Recommended action: ${row.recommendedAction}`);
      if (row.populationEstimate) summary.push(`  Population: ${row.populationEstimate.toLocaleString()}`);
      if (typeof row.disasterCount === 'number' || typeof row.acledCount === 'number') {
        summary.push(`  Signals: GDACS ${row.disasterCount ?? 0}, ACLED ${row.acledCount ?? 0}`);
      }
      if (row.hazardReadinessGaps?.length) summary.push(`  Hazard readiness gaps: ${row.hazardReadinessGaps.join(' | ')}`);
      if (row.keyGaps?.length) summary.push(`  Key gaps: ${row.keyGaps.join(' | ')}`);
    });

    summary.push(`\n⚡ IMPORTANT: Use this prioritization board as the primary source for ranked admin-level priorities, recommended next steps, and leadership-focused decision support.`);
    summary.push(`   The board may include AI-generated synthesis fields. Treat linked sources and loaded data as the verification basis for those narrative fields.`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // Disaster information
  if (context.disasters && context.disasters.length > 0) {
    summary.push(`\nACTIVE DISASTERS (showing ${Math.min(context.disasters.length, 10)} most relevant):`);
    context.disasters.slice(0, 10).forEach(disaster => {
      summary.push(`- ${disaster.eventType}: ${disaster.eventName || disaster.title}`);
      summary.push(`  Alert Level: ${disaster.alertLevel || 'Unknown'}`);
      if (disaster.severity) summary.push(`  Severity: ${disaster.severity}`);
    });
    if (context.disasters.length > 10) {
      summary.push(`... context limited to most relevant disasters for performance`);
    }
  }

  if (context.outbreaks && context.outbreaks.length > 0) {
    const diseases = [...new Set(context.outbreaks.map((item) => item.disease).filter(Boolean))];
    const countries = [...new Set(context.outbreaks.map((item) => item.country).filter(Boolean))];
    const outbreakRecency = (item = {}) => {
      const ts = new Date(item.reportDate || item.filterDate || item.updatedDate || 0).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };
    const sortedOutbreaks = context.outbreaks.slice().sort((a, b) => outbreakRecency(b) - outbreakRecency(a));
    summary.push(`\nWHO DISEASE OUTBREAK NEWS (${context.outbreaks.length} mapped outbreak locations in current filter, sorted newest first):`);
    if (diseases.length > 0) summary.push(`- Diseases: ${diseases.slice(0, 12).join(', ')}`);
    if (countries.length > 0) summary.push(`- Countries: ${countries.slice(0, 16).join(', ')}`);
    sortedOutbreaks.slice(0, 20).forEach((outbreak) => {
      const locationLabel = [
        outbreak.locationName && outbreak.locationName !== outbreak.country ? outbreak.locationName : null,
        outbreak.admin1,
        outbreak.country
      ].filter(Boolean).join(', ') || outbreak.country || 'Unknown country';
      const precision = outbreak.locationType || outbreak.locationConfidence || 'country';
      summary.push(`- ${outbreak.reportDate || 'Unknown date'}: ${outbreak.title || outbreak.disease} (${locationLabel}; mapped at ${precision} level)`);
      if (outbreak.metrics?.cases || outbreak.metrics?.deaths || outbreak.metrics?.cfr) {
        summary.push(`  Metrics: cases ${outbreak.metrics.cases ?? 'unknown'}, deaths ${outbreak.metrics.deaths ?? 'unknown'}, CFR ${outbreak.metrics.cfr ?? 'unknown'}`);
      }
      if (outbreak.locationSnippet) summary.push(`  Location evidence: ${outbreak.locationSnippet.slice(0, 220)}`);
      if (outbreak.sourceUrl) summary.push(`  WHO source: ${outbreak.sourceUrl}`);
    });
    summary.push('Use these WHO DONS items as loaded workspace context before web search when discussing disease outbreaks.');
  }

  // Impact statistics
  if (context.impactStatistics) {
    summary.push('\nIMPACT ASSESSMENT:');
    summary.push(`- Facilities Impacted: ${context.impactStatistics.facilitiesImpacted || 0}`);
    summary.push(`- Total Impacts: ${context.impactStatistics.totalImpacts || 0}`);
    if (context.impactStatistics.byDisasterType) {
      summary.push('- By Disaster Type:');
      Object.entries(context.impactStatistics.byDisasterType).forEach(([type, count]) => {
        summary.push(`  * ${type}: ${count}`);
      });
    }
  }

  // Impacted sites
  if (context.impactedFacilities && context.impactedFacilities.length > 0) {
    const totalImpacted = context.totalImpactedFacilities || context.impactedFacilities.length;
    summary.push(`\nIMPACTED SITES (showing ${context.impactedFacilities.length} of ${totalImpacted} total):`);
    context.impactedFacilities.slice(0, 5).forEach(item => {
      summary.push(`- ${item.facility.name}: ${item.impacts.length} disaster(s) affecting it`);
    });
    if (totalImpacted > context.impactedFacilities.length) {
      summary.push(`... plus ${totalImpacted - context.impactedFacilities.length} additional impacted sites not included in the chat sample`);
    } else if (context.impactedFacilities.length > 5) {
      summary.push(`... and ${context.impactedFacilities.length - 5} more sites`);
    }
  }

  // ACLED security data
  if (context.acledData && context.acledEnabled && context.acledData.length > 0) {
    const totalEvents = context.totalAcledEvents || context.acledData.length;
    const scopedEvents = context.scopedAcledEvents;
    summary.push(`\nACLED SECURITY DATA LOADED: ${totalEvents.toLocaleString()} total conflict events in system`);
    if (Number.isFinite(scopedEvents)) {
      summary.push(`Current analysis scope ACLED events: ${scopedEvents.toLocaleString()}`);
    }
    summary.push(`Context Sample: Showing ${context.acledData.length} filtered events for your analysis`);
    summary.push('Status: ACTIVE - Full ACLED dataset is being used in all security assessments');

    // Show active filters if any
    if (context.acledConfig) {
      const filters = [];
      if (context.acledConfig.dateRange) {
        filters.push(`Date Range: Last ${context.acledConfig.dateRange} days`);
      }
      if (context.acledConfig.selectedCountries && context.acledConfig.selectedCountries.length > 0) {
        filters.push(`Countries: ${context.acledConfig.selectedCountries.join(', ')}`);
      }
      if (context.acledConfig.selectedRegions && context.acledConfig.selectedRegions.length > 0) {
        filters.push(`Regions: ${context.acledConfig.selectedRegions.join(', ')}`);
      }
      if (context.acledConfig.eventTypes && context.acledConfig.eventTypes.length > 0) {
        filters.push(`Event Types: ${context.acledConfig.eventTypes.join(', ')}`);
      }

      if (filters.length > 0) {
        summary.push('\nACTIVE ACLED FILTERS:');
        filters.forEach(filter => summary.push(`  - ${filter}`));
      }
    }

    // Count recent incidents (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentIncidents = context.acledData.filter(event => {
      const eventDate = new Date(event.event_date);
      return eventDate >= thirtyDaysAgo;
    });

    if (recentIncidents.length > 0) {
      summary.push(`Recent Incidents (Last 30 days): ${recentIncidents.length}`);

      // Count by event type
      const incidentsByType = {};
      recentIncidents.forEach(incident => {
        const type = incident.event_type;
        incidentsByType[type] = (incidentsByType[type] || 0) + 1;
      });

      summary.push('Event Types:');
      Object.entries(incidentsByType)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          summary.push(`  - ${type}: ${count}`);
        });

      // Countries covered
      const countries = [...new Set(context.acledData.map(e => e.country).filter(Boolean))];
      if (countries.length > 0) {
        summary.push(`Countries covered: ${countries.slice(0, 10).join(', ')}${countries.length > 10 ? ` and ${countries.length - 10} more` : ''}`);
      }

      summary.push('\nNOTE: Security assessments are enhanced with this real ACLED conflict data for proximity analysis and risk scoring.');
    }

    const detailedEvents = context.acledData
      .filter((event) => event?.notes || event?.actor1 || event?.actor2 || event?.source)
      .slice(0, 5);

    if (detailedEvents.length > 0) {
      summary.push('\nACLED EVENT DETAIL SAMPLE:');
      detailedEvents.forEach((event, index) => {
        summary.push(`- Event ${index + 1}: ${event.event_type || 'Unknown'} | ${event.sub_event_type || 'No subtype'} | ${event.location || 'Unknown location'} | ${event.event_date || 'Unknown date'}`);
        if (event.actor1) summary.push(`  Actor 1: ${event.actor1}`);
        if (event.actor2) summary.push(`  Actor 2: ${event.actor2}`);
        if (event.notes) summary.push(`  Details: ${event.notes}`);
        if (event.source) summary.push(`  Source: ${event.source}`);
      });
    }
  } else if (context.acledData && !context.acledEnabled) {
    summary.push('\nACLED DATA: Uploaded but DISABLED - Not being used in analysis');
  }

  // District boundaries information (detailed)
  if (context.hasDistricts && context.districts) {
    const d = context.districts;
    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`ADMINISTRATIVE BOUNDARIES SHAPEFILE (User-Uploaded)`);
    summary.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    summary.push(`\n📍 GEOGRAPHIC AREA:`);
    summary.push(`   Country: ${d.country}`);
    if (d.region && d.region !== 'Unknown') {
      summary.push(`   Region: ${d.region}`);
    }
    summary.push(`   Total Districts: ${d.totalCount}`);
    summary.push(`   Coverage Area: ${d.geographicBounds.minLat}°N to ${d.geographicBounds.maxLat}°N, ${d.geographicBounds.minLng}°E to ${d.geographicBounds.maxLng}°E`);
    summary.push(`   Center Point: ${d.geographicBounds.centerLat}°, ${d.geographicBounds.centerLng}°`);

    summary.push(`\n🎯 DISTRICT RISK ASSESSMENT (Based on Active Disasters & ACLED Security Events):`);
    const totalWithRisk = d.riskBreakdown['very-high'] + d.riskBreakdown.high + d.riskBreakdown.medium + d.riskBreakdown.low;
    summary.push(`   ⚠️  Very High Risk: ${d.riskBreakdown['very-high']} districts (NO-GO zones)`);
    summary.push(`   🔴 High Risk: ${d.riskBreakdown.high} districts (Extreme caution)`);
    summary.push(`   🟡 Medium Risk: ${d.riskBreakdown.medium} districts (Moderate caution)`);
    summary.push(`   🟢 Low Risk: ${d.riskBreakdown.low} districts (Minimal concerns)`);
    summary.push(`   🔵 No Risk: ${d.riskBreakdown.none} districts (Safe for operations)`);
    summary.push(`   📊 Total at Risk: ${totalWithRisk} of ${d.totalCount} districts (${((totalWithRisk / d.totalCount) * 100).toFixed(1)}%)`);

    // Show example districts for each risk level
    if (d.sampleDistricts['very-high'].length > 0) {
      summary.push(`\n   Very High Risk Examples:`);
      d.sampleDistricts['very-high'].forEach(dist => {
        summary.push(`      • ${dist.name} (${dist.eventCount} events, score: ${dist.score})`);
      });
    }

    if (d.sampleDistricts.high.length > 0) {
      summary.push(`\n   High Risk Examples:`);
      d.sampleDistricts.high.forEach(dist => {
        summary.push(`      • ${dist.name} (${dist.eventCount} events, score: ${dist.score})`);
      });
    }

    if (d.sampleDistricts.medium.length > 0) {
      summary.push(`\n   Medium Risk Examples:`);
      d.sampleDistricts.medium.forEach(dist => {
        summary.push(`      • ${dist.name} (${dist.eventCount} events, score: ${dist.score})`);
      });
    }

    summary.push(`\n💡 INTERACTIVE MAP FEATURES:`);
    summary.push(`   • Districts are color-coded by risk: Blue (none) → Green (low) → Yellow (medium) → Orange (high) → Red (very high)`);
    summary.push(`   • User can ask you to highlight specific districts, and you can trigger map highlighting`);
    summary.push(`   • Example queries: "highlight high risk districts", "show me no-go areas", "which districts are safe?"`);
    summary.push(`   • When user asks to highlight/show districts, explain which districts match and the system will automatically highlight them on the map`);

    if (Array.isArray(context.adminNumericFields) && context.adminNumericFields.length > 0) {
      summary.push(`\n📊 AVAILABLE NUMERIC MAP FIELDS:`);
      context.adminNumericFields.slice(0, 40).forEach((field) => {
        const sourceLabel = field.source === 'admin_properties' ? 'admin attributes' : 'uploaded rows';
        summary.push(`   • ${field.label || field.field} (${sourceLabel}, ${field.count} value${field.count === 1 ? '' : 's'})`);
      });
      if (context.adminNumericFields.length > 40) {
        summary.push(`   • +${context.adminNumericFields.length - 40} more numeric fields`);
      }
    }

    if (Array.isArray(context.adminMetricValues) && context.adminMetricValues.length > 0) {
      summary.push(`\n📈 ADMIN NUMERIC FIELD VALUES:`);
      summary.push(`Use these district/value rows when the user asks for a list, table, ranking, min/max, or metric map from loaded admin data. Do not say the full list is unavailable when the requested field is listed here.`);
      context.adminMetricValues.slice(0, 30).forEach((metric) => {
        const sourceLabel = metric.source === 'admin_properties' ? 'admin attributes' : 'uploaded rows';
        summary.push(`   Field: ${metric.label || metric.field} (${sourceLabel}, ${metric.count} district value${metric.count === 1 ? '' : 's'}${metric.truncated ? ', sample shown' : ''})`);
        (metric.values || []).slice(0, 80).forEach((item) => {
          const countSuffix = item.count && item.count > 1 ? ` (${item.count} rows)` : '';
          summary.push(`      - ${item.district}: ${item.value}${countSuffix}`);
        });
      });
    }

    summary.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // Recent analysis or recommendations
  if (context.recentAnalysis) {
    summary.push('\nRECENT ANALYSIS:');
    summary.push(context.recentAnalysis);
  }

  return summary.join('\n');
}

export default withRateLimit(handler);
