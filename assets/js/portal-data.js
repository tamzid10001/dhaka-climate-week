/* Dhaka Climate Week — partner portal shared data & helpers.
   Used by partner-portal.html (selection UI) and admin.html (analytics). */
(function () {
  'use strict';

  var TIMES = {
    mc: 'Masterclass · 11:00 – 11:20 AM',
    panel: 'Panel Discussion · 11:40 – 12:40 PM',
    story: 'Storyteller Session · 12:50 – 1:15 PM'
  };

  var SESSIONS = [
    {
      id: 's1', num: '01', title: 'Energy Transition',
      objectives: 'Provide a high-level overview of the energy transition and clean mobility agenda, inspiring participants and laying the foundation for deeper discussions, collaboration, and action throughout the day.',
      audiences: [
        ['Government & Urban Policymakers', 'DNCC, DSCC, Ministry of Power, BRTA'],
        ['Private Sector & Industry', 'Renewable energy, Automotive companies'],
        ['Startups & Entrepreneurs', 'Climate tech, Battery technology'],
        ['Investors & Development Partners', 'Impact investors, Development Banks'],
        ['Corporate Sustainability Leaders', 'ESG managers, Manufacturing'],
        ['Universities & Youth Leaders', 'Engineering, Urban planning students']
      ],
      masterclass: { role: 'Senior leader from a global clean energy or electric mobility company', eg: 'e.g CEO or Country Director of a renewable energy company or EV manufacturer (BYD)' },
      moderator: 'Energy sector journalist or ESG editor or BUET energy faculty',
      panelists: [
        'Government official (Power Ministry or BRTA)',
        'Renewable energy industry leader',
        'Clean energy investor or development finance representative'
      ],
      storyteller: { orgs: 'Climate tech, EV battery technology', who: 'Founder or top management from e.g SOLshare, ATEC' }
    },
    {
      id: 's2', num: '02', title: 'Tech for the Planet',
      objectives: "Set the stage for the day's conversations by highlighting how AI, digital innovation, and emerging technologies can accelerate climate action and create scalable solutions.",
      audiences: [
        ['Technology & AI Professionals', 'Software engineers, AI/data scientists, GIS'],
        ['Climate Tech Startups', 'AgriTech, CleanTech, Energy startups'],
        ['Government & Smart City Officials', 'ICT Division, Smart City, Env. regulators'],
        ['Investors & Development Partners', 'Impact investors, Development Banks'],
        ['Corporate Innovation & ESG', 'ESG managers, Digital transformation'],
        ['Universities & Youth Leaders', 'Engineering, CSE, Data science students']
      ],
      masterclass: { role: 'Senior executive from a global technology company driving AI and digital innovation for sustainability', eg: 'e.g Microsoft, Google, Amazon Web Services (AWS), NVIDIA' },
      moderator: 'Technology Business Leader',
      panelists: [
        'Representative from ICT Division, (DNCC/DSCC digital team)',
        'Founder Climate-tech or AgriTech startup',
        "Tech companies' Sr. leader"
      ],
      storyteller: { orgs: 'CleanTech, AI', who: 'Sr. Management from Robi Axiata, Microsoft Bangladesh' }
    },
    {
      id: 's3', num: '03', title: 'Agriculture',
      objectives: "Set the stage for the day's conversations by highlighting how climate-smart agriculture, innovation, and resilient food systems can strengthen food security and drive sustainable development.",
      audiences: [
        ['Farmers & Producer Organizations', 'Smallholder farmers, cooperatives, ext. officers'],
        ['AgriTech Startups', 'Precision agriculture, Irrigation, Supply chain'],
        ['Development organizations', 'FAO, IFAD, iDE, Swisscontact, Heifer, Oxfam'],
        ['Government & Agricultural Policy', 'Ministry of Agriculture, DAE, BARI'],
        ['Corporate Innovation & ESG', 'ESG managers, Sustainability officers'],
        ['Universities & Youth Leaders', 'Agricultural universities, Environmental students, Soil scientists']
      ],
      masterclass: { role: 'Global leader in climate-smart agriculture and food systems', eg: 'e.g CGIAR, FAO, iDE, Oxfam' },
      moderator: 'Agricultural economist or development sector agriculture program lead',
      panelists: [
        'Sr. representative from BARI',
        'AgriTech startup founder or agri-supply-chain investor',
        'Leader of a farmer producer organization or agri-cooperative'
      ],
      storyteller: { orgs: 'AgriTech, Agri-FinTech, Precision agriculture', who: 'Founder from e.g. Bettle Regen Solutions, Aunkur' }
    },
    {
      id: 's4', num: '04', title: 'Circularity',
      objectives: 'Explore how circular economy approaches can transform waste into value, inspiring collaboration and practical action across industries, communities, and government.',
      audiences: [
        ['Circular Economy Businesses', 'Recycling, Upcycling, Waste management'],
        ['Manufacturers & Consumer Brands', 'FMCG, Packaging, RMG, Hospitality'],
        ['Startups & Social Enterprises', 'Circular economy, Waste-tech innovators'],
        ['Government & City Authorities', 'DNCC, DSCC, Dept of Environment'],
        ['NGOs & Community Organizations', 'Environmental NGOs, Youth organizations'],
        ['Universities & Youth Leaders', 'Environmental engineering, Industrial design']
      ],
      masterclass: { role: 'Global Circular Economy & Sustainability Leader', eg: 'e.g Sandra Goldmark, Asst. Dean Columbia Climate School' },
      moderator: 'Waste Concern communications lead or circular-economy network coordinator',
      panelists: [
        'Sr. representative from DNCC/DSCC waste management',
        'Sustainability lead from RMG or FMCG company',
        'Waste-picker organization or community recycling initiative'
      ],
      storyteller: { orgs: 'Circular economy, Waste-tech innovators', who: 'Founder from e.g Garbageman, and Maliha Polytex' }
    },
    {
      id: 's5', num: '05', title: 'Water for Resilience',
      objectives: "Set the stage for the day's conversations by exploring how water resilience can drive sustainable development, climate adaptation, and stronger communities.",
      audiences: [
        ['Water & Climate Experts', 'Hydrologists, Flood risk, Adaptation experts'],
        ['Government & Water Authorities', 'BWDB, Dhaka WASA, Min. of Water Resources'],
        ['Technology & Innovation', 'Water tech, GIS, Nature-based solutions'],
        ['Development Organizations', 'UNICEF, WaterAid, UNDP, World Bank, ADB'],
        ['Smart City Innovators', 'GIS, Climate data, Digital infrastructure'],
        ['Universities & Youth Leaders', 'Water engineering, Coastal resilience']
      ],
      masterclass: { role: 'Global Water Resilience & Climate Adaptation Leader', eg: 'e.g Wateraid, World Bank, ADB, Delta Coalition partners' },
      moderator: 'Water/climate journalist or researcher',
      panelists: [
        'Dhaka WASA or BWDB official',
        'Delta Coalition or regional hydrologist',
        'WaterAid, UNICEF, or World Bank water-sector lead'
      ],
      storyteller: { orgs: 'WASH, water-tech, delta resilience', who: 'Founder from e.g Footsteps and others' }
    },
    {
      id: 's6', num: '06', title: 'Urban Planning',
      objectives: 'Provide a high-level overview of climate-resilient urban planning, building awareness of how sustainable and inclusive city design can strengthen resilience and lay the foundation for deeper discussions throughout the day.',
      audiences: [
        ['Urban Planners & Architects', 'Urban planners, Architects, Smart city pros'],
        ['Government & City Authorities', 'DNCC, DSCC, RAJUK, DTCA, LGED'],
        ['Real Estate Sector', 'Developers, Construction, Green building'],
        ['Development Organizations', 'UN-Habitat, World Bank, ADB, GIZ'],
        ['Smart City Innovators', 'GIS, Climate data, Smart mobility'],
        ['Universities & Youth Leaders', 'Urban planning, Civil engineering, GIS']
      ],
      masterclass: { role: 'Senior urban planner, architect, or researcher specializing in climate-resilient city development', eg: 'e.g C40 Cities, World Bank, ADB, RAJUK, ARUP' },
      moderator: 'Academic from a planning department',
      panelists: [
        'RAJUK or DTCA official',
        'Green building professional or real estate developer engaged in climate-resilient construction'
      ],
      storyteller: { orgs: 'Urban resilience', who: 'C40 Cities, BUET, ARUP' }
    }
  ];

  var DAY2_SESSIONS = [
    {
      id: 'd2_s1', num: '01', title: 'Energy Transition', venue: 'Independent University of Bangladesh (IUB)',
      objectives: "Bring together students, academia, industry, startups, and policymakers to explore Bangladesh's clean energy transition, inspire innovation, and foster collaborations that accelerate practical climate solutions.",
      audiences: [
        ['Engineering students, renewable energy researchers, utility companies, clean mobility startups, energy policymakers', 'Engineering & Policy']
      ],
      masterclassTopic: 'Powering tomorrow: how Bangladesh can lead the clean energy shift',
      masterclass: { role: 'Founder & CEO ATEC Global, Country Head of BYD, Managing Director of Grameen Shakti', eg: 'Keynote expert voice' },
      moderator: 'Senior Energy & Climate Policy Expert',
      panelists: [
        'Startup representative e.g SOLshare',
        'Financing renewable energy e.g IDCOL, JICA, Green Climate Fund',
        'Professor or researcher renewable energy e.g North South University'
      ],
      storyteller: { orgs: 'Climate tech, EV battery technology', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Renewable energy, EV, Solar and deep tech', judges: 'Semi final & final judges' }
    },
    {
      id: 'd2_s2', num: '02', title: 'Tech for the Planet', venue: 'Daffodil International University (DIU)',
      objectives: 'Bring together academia, industry, government, and startups to explore the role of AI, digital technologies, and innovation in accelerating climate action, strengthening collaboration, and building a resilient green economy.',
      audiences: [
        ['Computer Science students, AI researchers, software developers, climate-tech startups, technology companies', 'CS & Tech Community']
      ],
      masterclassTopic: 'Code green: using AI, data, and digital tools to fight climate change',
      masterclass: { role: 'Founder of Climatebase Evan Hynes', eg: 'Keynote expert voice' },
      moderator: 'Senior Climate Tech & Digital Innovation Leader',
      panelists: [
        'Startup representative e.g Carbobon',
        'Government e.g iDEA Project ICT Ministry',
        'Professor or researcher of GIS, Climate Informatics e.g DIU'
      ],
      storyteller: { orgs: 'Climate tech, GIS, AI', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Digital Solutions for a Sustainable Future', judges: 'Semi final & final judges' }
    },
    {
      id: 'd2_s3', num: '03', title: 'Agriculture', venue: 'Gazipur Agriculture University (GAU)',
      objectives: 'Inspire the next generation of agricultural leaders by connecting academia, industry, government, and innovators to advance climate-smart agriculture, food security, and sustainable rural development.',
      audiences: [
        ['Agriculture students, food systems researchers, AgriTech innovators', 'Agriculture & AgriTech']
      ],
      masterclassTopic: 'Feed the future: climate-smart agriculture for a changing Bangladesh',
      masterclass: { role: 'Senior Climate-Smart Agriculture & Food Systems Expert', eg: 'Keynote expert voice' },
      moderator: 'Senior Climate-Smart Agriculture & Food Systems Expert',
      panelists: [
        'Startup representative e.g Beetle Regen',
        'Government e.g BARI',
        'Professor specializing in Climate-Smart Agriculture'
      ],
      storyteller: { orgs: 'AgriTech, Agri-FinTech', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Climate-Smart Agriculture Challenge', judges: 'Semi final & final judges' }
    },
    {
      id: 'd2_s4', num: '04', title: 'Circularity', venue: 'North South University (NSU)',
      objectives: 'Empower the next generation of innovators and business leaders to rethink waste as a resource by promoting circular design, sustainable production, and cross-sector collaboration.',
      audiences: [
        ['Environmental science, industrial engineering students, recycling entrepreneurs', 'Environmental & Circularity']
      ],
      masterclassTopic: 'Close the loop: rethinking waste, materials, and the circular economy',
      masterclass: { role: 'Senior Circular Economy & Sustainability Expert', eg: 'Keynote expert voice' },
      moderator: 'Senior Circular Economy & Sustainability Expert',
      panelists: [
        'Startup representative e.g Garbagemen, BRTL',
        'Government e.g DNCC',
        'Professor specializing in circularity'
      ],
      storyteller: { orgs: 'Wastemanagement', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Nothing Wasted Innovation Challenge', judges: 'Semi final & final judges' }
    },
    {
      id: 'd2_s5', num: '05', title: 'Water for Resilience', venue: 'United International University (UIU)',
      objectives: "Empower students and future leaders to address Bangladesh's water challenges through innovation, collaboration, and cross-sector partnerships that build resilient communities and sustainable water systems.",
      audiences: [
        ['Civil/environmental engineering students, water and climate researchers', 'Water & Delta Researchers']
      ],
      masterclassTopic: 'Blue futures: water, floods, and climate resilience in the delta',
      masterclass: { role: 'Senior Water & Climate Resilience Expert', eg: 'Keynote expert voice' },
      moderator: 'Senior Water & Climate Resilience Expert',
      panelists: [
        'Startup representative e.g Footsteps',
        'Government representative from Ministry of Water Resources',
        'Professor in Water Resources, Climate Adaptation, or Hydrology'
      ],
      storyteller: { orgs: 'WASH, water-tech, delta resilience', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Water for Tomorrow', judges: 'Semi final & final judges' }
    },
    {
      id: 'd2_s6', num: '06', title: 'Urban Planning', venue: 'BRAC University',
      objectives: 'Empower students and future city leaders to reimagine urban planning through innovation, collaboration, and cross-sector partnerships that strengthen resilience, sustainability, and quality of life.',
      audiences: [
        ['Architecture, planning, civil engineering students, urban development practitioners', 'Urban Planning & Architecture']
      ],
      masterclassTopic: 'Cities for people: designing Dhaka for a climate-resilient future',
      masterclass: { role: 'Senior Urban Planning & Climate Resilience Expert', eg: 'Keynote expert voice' },
      moderator: 'Senior Urban Planning & Climate Resilience Expert',
      panelists: [
        'Sr. Executive from an Architecture, Engineering, or Real Estate Firm',
        'Government Representative from RAJUK',
        'Professor or Urban Planning Expert'
      ],
      storyteller: { orgs: 'Urban resilience', who: 'Shakti Foundation' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Designing the Climate City', judges: 'Semi final & final judges' }
    }
  ];

  var SCOPE_NAMES = { cd: 'Co-Design', ex: 'Expert', cm: 'Communicate' };

  /* suffix is the part of a checkbox id after "sN-" or "d2_sN-": cd | a0..a5 | mc | mod | p0..p2 | st | ws | hk */
  function selectionLabel(s, suffix) {
    if (suffix === 'cd') return { tag: 'cd', text: 'Co-Design the session' };
    if (suffix === 'mc') return { tag: 'ex', text: 'Expert — Masterclass facilitator (' + (s.masterclassTopic || s.masterclass.role) + ')' };
    if (suffix === 'mod') return { tag: 'ex', text: 'Expert — Panel moderator (' + s.moderator + ')' };
    if (suffix === 'st') return { tag: 'ex', text: 'Expert — Storyteller (' + s.storyteller.who + ')' };
    if (suffix === 'ws') return { tag: 'ex', text: 'Expert / Judges — Workshop: ' + (s.workshop ? s.workshop.name : 'Facilitator') };
    if (suffix === 'hk') return { tag: 'ex', text: 'Judges — Hackathon: ' + (s.hackathon ? s.hackathon.theme : 'Judge') };
    if (suffix.charAt(0) === 'p') {
      var p = s.panelists[+suffix.slice(1)];
      if (p !== undefined) return { tag: 'ex', text: 'Expert — Panelist: ' + p };
    }
    if (suffix.charAt(0) === 'a') {
      var a = s.audiences[+suffix.slice(1)];
      if (a !== undefined) return { tag: 'cm', text: 'Communicate — ' + a[0] };
    }
    return null;
  }

  function sessionById(id) {
    var i;
    for (i = 0; i < SESSIONS.length; i++) if (SESSIONS[i].id === id) return SESSIONS[i];
    for (i = 0; i < DAY2_SESSIONS.length; i++) if (DAY2_SESSIONS[i].id === id) return DAY2_SESSIONS[i];
    return null;
  }

  /* full checkbox id like "s3-p1" → { session, tag, scope, text } or null */
  function labelForId(id) {
    var dash = id.indexOf('-');
    if (dash === -1) return null;
    var s = sessionById(id.slice(0, dash));
    if (!s) return null;
    var lab = selectionLabel(s, id.slice(dash + 1));
    if (!lab) return null;
    return { session: s, tag: lab.tag, scope: SCOPE_NAMES[lab.tag], text: lab.text };
  }

  /* ── Submissions (device-local; codes travel by email for cross-device import) ── */
  var SUBS_KEY = 'dcwSubmissions';

  function getSubmissions() {
    try {
      var list = JSON.parse(localStorage.getItem(SUBS_KEY)) || [];
      return Array.isArray(list) ? list.filter(validSubmission) : [];
    } catch (e) { return []; }
  }

  function validSubmission(rec) {
    return rec && typeof rec.e === 'string' && rec.e.indexOf('@') > 0 &&
      typeof rec.t === 'number' && Array.isArray(rec.s) &&
      rec.s.every(function (id) { return typeof id === 'string' && labelForId(id); });
  }

  /* latest submission per partner wins */
  function recordSubmission(rec) {
    if (!validSubmission(rec)) return false;
    var list = getSubmissions().filter(function (r) { return r.e !== rec.e; });
    list.push(rec);
    list.sort(function (a, b) { return b.t - a.t; });
    try { localStorage.setItem(SUBS_KEY, JSON.stringify(list)); } catch (e) { return false; }
    return true;
  }

  function clearSubmissions() {
    try { localStorage.removeItem(SUBS_KEY); } catch (e) { /* ignore */ }
  }

  function encodeSubmission(rec) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(rec))));
  }

  function decodeSubmission(code) {
    try {
      var rec = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (validSubmission(rec)) {
        rec.s = rec.s.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
        return rec;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  window.DCW = {
    TIMES: TIMES,
    SESSIONS: SESSIONS,
    DAY2_SESSIONS: DAY2_SESSIONS,
    SCOPE_NAMES: SCOPE_NAMES,
    selectionLabel: selectionLabel,
    sessionById: sessionById,
    labelForId: labelForId,
    getSubmissions: getSubmissions,
    recordSubmission: recordSubmission,
    clearSubmissions: clearSubmissions,
    encodeSubmission: encodeSubmission,
    decodeSubmission: decodeSubmission
  };
})();
