/* Dhaka Climate Week — partner portal shared data & helpers.
   Used by partner-portal.html (selection UI) and admin.html (analytics). */
(function () {
  'use strict';

  var TIMES = {
    mc: 'Masterclass · 11:00 – 11:20 AM',
    panel: 'Panel Discussion · 11:40 – 12:40 PM',
    story: 'Storyteller Session · 12:50 – 1:15 PM',
    ws: 'Workshop · 11:40 – 12:40 PM',
    hack: 'Hackathon'
  };

  var SESSIONS = [
    {
      id: 's1', num: '01', title: 'Energy Transition', venue: 'Independent University of Bangladesh (IUB)',
      objectives: 'Bring together students, academia, industry, startups, and policymakers to explore Bangladesh\'s clean energy transition, inspire innovation, and foster collaborations that accelerate practical climate solutions.',
      audiences: [
        ['Primary Target Audience', 'Engineering students, renewable energy researchers, utility companies, clean mobility startups, energy policymakers']
      ],
      masterclass: { role: 'Powering tomorrow: how Bangladesh can lead the clean energy shift', eg: 'e.g Founder & CEO ATEC Global, Country Head of BYD, Managing Director of Grameen Shakti' },
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
      id: 's2', num: '02', title: 'Tech for the Planet', venue: 'Daffodil International University (DIU)',
      objectives: 'Bring together academia, industry, government, and startups to explore the role of AI, digital technologies, and innovation in accelerating climate action, strengthening collaboration, and building a resilient green economy.',
      audiences: [
        ['Primary Target Audience', 'Computer Science students, AI researchers, software developers, climate-tech startups, technology companies']
      ],
      masterclass: { role: 'Code green: using AI, data, and digital tools to fight climate change', eg: 'e.g Founder of Climatebase Evan Hynes' },
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
      id: 's3', num: '03', title: 'Agriculture', venue: 'Gazipur Agriculture University (GAU)',
      objectives: 'Inspire the next generation of agricultural leaders by connecting academia, industry, government, and innovators to advance climate-smart agriculture, food security, and sustainable rural development.',
      audiences: [
        ['Primary Target Audience', 'Agriculture students, food systems researchers, AgriTech innovators']
      ],
      masterclass: { role: 'Feed the future: climate-smart agriculture for a changing Bangladesh', eg: 'e.g Leading experts in climate-smart agriculture' },
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
      id: 's4', num: '04', title: 'Circularity', venue: 'North South University (NSU)',
      objectives: 'Empower the next generation of innovators and business leaders to rethink waste as a resource by promoting circular design, sustainable production, and cross-sector collaboration.',
      audiences: [
        ['Primary Target Audience', 'Environmental science, industrial engineering students, recycling entrepreneurs']
      ],
      masterclass: { role: 'Close the loop: rethinking waste, materials, and the circular economy', eg: 'e.g Leading experts in circular economy' },
      moderator: 'Senior Circular Economy & Sustainability Expert',
      panelists: [
        'Startup representative e.g Garbagemen, BRTL',
        'Government e.g DNCC',
        'Professor specializing in circularity'
      ],
      storyteller: { orgs: 'Waste management', who: 'Founder or top management' },
      workshop: { name: 'Career in ESG', facilitator: 'Mycellium' },
      hackathon: { theme: 'Nothing Wasted Innovation Challenge', judges: 'Semi final & final judges' }
    },
    {
      id: 's5', num: '05', title: 'Water for Resilience', venue: 'United International University (UIU)',
      objectives: 'Empower students and future leaders to address Bangladesh\'s water challenges through innovation, collaboration, and cross-sector partnerships that build resilient communities and sustainable water systems.',
      audiences: [
        ['Primary Target Audience', 'Civil/environmental engineering students, water and climate researchers']
      ],
      masterclass: { role: 'Blue futures: water, floods, and climate resilience in the delta', eg: 'e.g Leading experts in water resources and adaptation' },
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
      id: 's6', num: '06', title: 'Urban Planning', venue: 'BRAC University',
      objectives: 'Empower students and future city leaders to reimagine urban planning through innovation, collaboration, and cross-sector partnerships that strengthen resilience, sustainability, and quality of life.',
      audiences: [
        ['Primary Target Audience', 'Architecture, planning, civil engineering students, urban development practitioners']
      ],
      masterclass: { role: 'Cities for people: designing Dhaka for a climate-resilient future', eg: 'e.g Leading experts in urban planning & climate resilience' },
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

  /* suffix is the part of a checkbox id after "sN-": cd | a0..a5 | mc | mod | p0..p2 | st | ws | hack */
  function selectionLabel(s, suffix) {
    if (suffix === 'cd') return { tag: 'cd', text: 'Co-Design the session' };
    if (suffix === 'mc') return { tag: 'ex', text: 'Expert — Masterclass topic: ' + s.masterclass.role };
    if (suffix === 'mod') return { tag: 'ex', text: 'Expert — Panel moderator (' + s.moderator + ')' };
    if (suffix === 'st') return { tag: 'ex', text: 'Expert — Storyteller (' + s.storyteller.who + ')' };
    if (suffix === 'ws') return { tag: 'ex', text: 'Expert/Judges — Workshop: ' + (s.workshop ? s.workshop.name : 'Workshop') };
    if (suffix === 'hack') return { tag: 'ex', text: 'Judges — Hackathon: ' + (s.hackathon ? s.hackathon.theme : 'Hackathon') };
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
    for (var i = 0; i < SESSIONS.length; i++) if (SESSIONS[i].id === id) return SESSIONS[i];
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
