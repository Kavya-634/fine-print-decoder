// Fine Print Decoder: local, transparent heuristics for pasted legal text.
// Requirements: roughly 25 rules, grouped risk categories, original-clause
// evidence, plain-English explanations, and actionable tips.
// These signals prompt review; they are not legal advice or a legal verdict.
export type Severity = 'high' | 'medium' | 'low';

export type RiskCategory =
  | 'Data sharing'
  | 'Tracking'
  | 'Ad profiling'
  | 'Auto-renewals'
  | 'Cancellation'
  | 'Arbitration'
  | 'Content licensing'
  | 'Unilateral changes'
  | 'Liability limits'
  | 'Data retention'
  | 'Account termination'
  | 'Third-party sharing';

export interface RiskRule {
  id: string;
  category: RiskCategory;
  severity: Severity;
  patterns: readonly RegExp[];
  title: string;
  explanation: string;
  tip: string;
}

// Patterns are alternatives (OR), case-insensitive and intentionally bounded.
// The scanner separately checks nearby negation. Severity is editorial, not a
// legal conclusion. Expand the fixtures whenever a rule changes.
export const rules: readonly RiskRule[] = [
  {
    id: 'data-sale',
    category: 'Data sharing',
    severity: 'high',
    patterns: [
      /\b(?:sell|selling|sale of|rent|renting)\b.{0,65}?\b(?:personal (?:data|information)|your (?:data|information))\b/i,
    ],
    title: 'Your personal data may be sold',
    explanation:
      'This wording may allow the company to sell or rent personal information. That can put your data in the hands of businesses you never directly chose.',
    tip: 'Look for a “Do not sell or share my personal information” option and review which data and recipients are covered.',
  },
  {
    id: 'affiliate-sharing',
    category: 'Data sharing',
    severity: 'medium',
    patterns: [
      /\bshar(?:e|es|ed|ing)\b.{0,100}?\b(?:affiliates|affiliated companies|corporate family|group companies)\b/i,
    ],
    title: 'Your data can travel across a company group',
    explanation:
      'Information you give to one service may also reach its affiliated companies. Their purposes and practices may differ from the service you signed up for.',
    tip: 'Check the list of affiliates, permitted uses, and whether an opt-out applies to sharing across the whole group.',
  },
  {
    id: 'business-transfer',
    category: 'Data sharing',
    severity: 'medium',
    patterns: [
      /\b(?:data|information)\b.{0,110}?\b(?:merger|acquisition|bankruptcy|sale of (?:our |the )?assets)\b/i,
      /\b(?:merger|acquisition|bankruptcy)\b.{0,110}?\b(?:transfer|disclos|shar)\w*\b/i,
    ],
    title: 'A new owner may inherit your data',
    explanation:
      'A merger, sale, or bankruptcy could move your information to another organization. The clause may not promise that you will be asked first.',
    tip: 'Look for a notice requirement and a way to delete your information before a business transfer.',
  },
  {
    id: 'cross-site-tracking',
    category: 'Tracking',
    severity: 'medium',
    patterns: [
      /\b(?:track|tracking|monitor|collect)\w*\b.{0,110}?\b(?:across (?:different |other |multiple )?(?:websites|sites|services)|cross[- ]site|browsing (?:history|activity))\b/i,
      /\b(?:third[- ]party|advertising|tracking) cookies\b/i,
    ],
    title: 'Your activity may be tracked beyond this site',
    explanation:
      'Tracking technologies may connect what you do here with activity elsewhere. A mention alone does not tell you whether these trackers are enabled by default.',
    tip: 'Review cookie preferences, reject optional tracking where available, and check your browser’s cross-site tracking controls.',
  },
  {
    id: 'device-fingerprinting',
    category: 'Tracking',
    severity: 'high',
    patterns: [
      /\b(?:device|browser|digital) fingerprint(?:ing|s)?\b/i,
      /\b(?:unique|persistent) (?:device )?identifier\w*\b.{0,75}?\b(?:track|recogniz|identify)\w*\b/i,
    ],
    title: 'Your device may be recognized without cookies',
    explanation:
      'Fingerprinting or persistent identifiers can recognize a device using its characteristics. Clearing cookies may not stop this kind of identification.',
    tip: 'Check whether identification is limited to security, whether it supports advertising, and what opt-out controls exist.',
  },
  {
    id: 'targeted-advertising',
    category: 'Ad profiling',
    severity: 'medium',
    patterns: [
      /\b(?:targeted|personalized|personalised|interest[- ]based|behavio(?:u)?ral) (?:advertising|ads|advertisements)\b/i,
      /\b(?:build|create)\w*\b.{0,65}?\b(?:advertising|marketing) profiles?\b/i,
    ],
    title: 'Your activity may shape the ads you see',
    explanation:
      'The service may use information about you to predict interests and select advertisements. This can involve creating or using an advertising profile.',
    tip: 'Find the personalized-ad settings and check whether turning them off stops data use or only changes the ads shown.',
  },
  {
    id: 'data-combination',
    category: 'Ad profiling',
    severity: 'high',
    patterns: [
      /\b(?:combin|enrich|supplement|link)\w*\b.{0,90}?\b(?:data|information|profile)\w*\b.{0,90}?\b(?:third parties|third[- ]party|other sources|data brokers|offline)\b/i,
    ],
    title: 'Your profile may include data from elsewhere',
    explanation:
      'The company may combine your information with outside sources. The resulting profile can reveal more about you than what you directly provided.',
    tip: 'Look for the outside data sources and whether you can access, correct, or opt out of enrichment of your profile.',
  },
  {
    id: 'automatic-renewal',
    category: 'Auto-renewals',
    severity: 'medium',
    patterns: [
      /\b(?:automatically|automatic) renew(?:s|ed|al)?\b/i,
      /\bauto[- ]renew(?:s|ed|al|ing)?\b/i,
      /\brenew\w* automatically\b/i,
    ],
    title: 'Your subscription may renew automatically',
    explanation:
      'The subscription can continue into another paid period without a new purchase decision. You may need to cancel before a specific cutoff.',
    tip: 'Check the renewal date, price, and cancellation deadline. Set a reminder before the cutoff, not just the billing date.',
  },
  {
    id: 'trial-conversion',
    category: 'Auto-renewals',
    severity: 'high',
    patterns: [
      /\b(?:free )?trial\b.{0,110}?\b(?:charged|billed|paid subscription|converts? to|automatically (?:charged|enrolled))\b/i,
      /\b(?:charge|bill)\w*\b.{0,85}?\b(?:trial ends|end of (?:the |your )?(?:free )?trial)\b/i,
    ],
    title: 'A free trial may turn into a paid plan',
    explanation:
      'The trial may lead to charges when it ends. You might need to take action before the end date to avoid paying.',
    tip: 'Confirm the first charge and cancellation cutoff before starting the trial. Save confirmation when you cancel.',
  },
  {
    id: 'non-refundable',
    category: 'Cancellation',
    severity: 'medium',
    patterns: [
      /\bnon[- ]refundable\b/i,
      /\bno refunds?\b/i,
      /\b(?:payments?|fees?|charges?)\b.{0,55}?\b(?:not refundable|will not be refunded)\b/i,
    ],
    title: 'Cancellation may not get your money back',
    explanation:
      'This wording may limit refunds for payments already made, including unused time. Exceptions or consumer rights may still apply.',
    tip: 'Check the refund exceptions and whether access continues after cancellation. Keep receipts and cancellation records.',
  },
  {
    id: 'cancellation-friction',
    category: 'Cancellation',
    severity: 'high',
    patterns: [
      /\b(?:cancel|cancellation|terminate your subscription)\w*\b.{0,100}?\b(?:by (?:phone|telephone|mail)|call us|written notice|\d+ days? (?:before|prior|in advance))\b/i,
      /\b(?:must|required to)\b.{0,50}?\b(?:call|telephone)\b.{0,60}?\bcancel\w*\b/i,
    ],
    title: 'Canceling may take extra steps or advance notice',
    explanation:
      'You may need to use a particular contact method or cancel well ahead of renewal. Simply deleting the app or stopping use may not end billing.',
    tip: 'Find the exact cancellation process now, allow time for advance notice, and ask for written confirmation.',
  },
  {
    id: 'binding-arbitration',
    category: 'Arbitration',
    severity: 'high',
    patterns: [
      /\b(?:binding|mandatory|compulsory) arbitration\b/i,
      /\bdisputes?\b.{0,75}?\b(?:resolved|settled)\b.{0,45}?\barbitration\b/i,
    ],
    title: 'Disputes may have to go to arbitration',
    explanation:
      'You may be required to use a private arbitration process rather than bring a claim in court. Exceptions, opt-out rights, and enforceability vary.',
    tip: 'Look for an arbitration opt-out deadline, who pays the fees, and exceptions such as small-claims court.',
  },
  {
    id: 'class-action-waiver',
    category: 'Arbitration',
    severity: 'high',
    patterns: [
      /\bwaiv\w*\b.{0,90}?\b(?:class[- ]action|jury trial|trial by jury)\b/i,
      /\bclass[- ]action waiver\b/i,
      /\b(?:may not|cannot|shall not)\b.{0,45}?\b(?:participate|join)\b.{0,45}?\bclass[- ]action\b/i,
    ],
    title: 'You may give up collective legal action',
    explanation:
      'The terms may restrict joining other users in a class action or waive a jury trial. This can change your options for resolving a dispute.',
    tip: 'Check whether the waiver has an opt-out, what claims it covers, and whether local law limits it.',
  },
  {
    id: 'broad-content-license',
    category: 'Content licensing',
    severity: 'high',
    patterns: [
      /\b(?:perpetual|irrevocable|royalty[- ]free|worldwide|sublicensable|transferable)\b.{0,110}?\blicen[cs]e\b/i,
      /\blicen[cs]e\b.{0,110}?\b(?:perpetual|irrevocable|sublicensable|royalty[- ]free)\b/i,
    ],
    title: 'The license to your content may be very broad',
    explanation:
      'You may keep ownership while granting wide permission to use your content. Duration, payment, transfer, and sublicensing terms determine how far that permission reaches.',
    tip: 'Check whether the license is limited to running the service and whether it ends when you delete your content.',
  },
  {
    id: 'content-reuse',
    category: 'Content licensing',
    severity: 'medium',
    patterns: [
      /\b(?:use|reproduce|modify|distribute|display)\b.{0,65}?\b(?:your|user) content\b.{0,90}?\b(?:commercial|promotional|marketing|any purpose|derivative works)\b/i,
      /\b(?:create|make) derivative works\b.{0,60}?\b(?:your|user) content\b/i,
    ],
    title: 'Your content may be reused or adapted',
    explanation:
      'The company may be allowed to adapt your content or reuse it for purposes beyond showing it to your intended audience.',
    tip: 'Check whether promotional use requires permission and avoid uploading content you cannot authorize others to reuse.',
  },
  {
    id: 'terms-change',
    category: 'Unilateral changes',
    severity: 'high',
    patterns: [
      /\b(?:change|modify|amend|update|revise)\w*\b.{0,55}?\b(?:terms|agreement|policy|policies)\b.{0,80}?\b(?:at any time|without (?:prior )?notice|sole discretion)\b/i,
    ],
    title: 'The terms may change without much warning',
    explanation:
      'The company may reserve broad power to change the agreement. This clause may not promise advance notice or your explicit approval.',
    tip: 'Look for notice periods, a change log, and the ability to cancel if a material change affects you.',
  },
  {
    id: 'continued-use-consent',
    category: 'Unilateral changes',
    severity: 'medium',
    patterns: [
      /\bcontinued use\b.{0,100}?\b(?:acceptance|accept|agree|consent)\w*\b/i,
      /\bcontinu(?:e|ing) to use\b.{0,110}?\b(?:accept|agree|consent)\w*\b/i,
    ],
    title: 'Keeping on using the service may count as agreement',
    explanation:
      'The company may treat continued use as acceptance of revised terms. You might not be asked to click an agreement button again.',
    tip: 'Read update notices and check the effective date and your options for stopping use or closing the account.',
  },
  {
    id: 'liability-cap',
    category: 'Liability limits',
    severity: 'high',
    patterns: [
      /\b(?:total|aggregate|maximum|our) liability\b.{0,100}?\b(?:limited to|not exceed|cap)\w*\b/i,
      /\bliability\b.{0,65}?\b(?:amount (?:you )?paid|fees (?:you )?paid)\b/i,
    ],
    title: 'Compensation may be capped',
    explanation:
      'The agreement may limit how much the company pays if something goes wrong, sometimes to the fees you paid. Legal exceptions may apply.',
    tip: 'Compare the cap with what a loss could cost you, especially if you rely on the service for work or important data.',
  },
  {
    id: 'damages-exclusion',
    category: 'Liability limits',
    severity: 'medium',
    patterns: [
      /\b(?:not|never)\b.{0,35}?\bliable\b.{0,90}?\b(?:indirect|consequential|incidental|loss of (?:data|profits))\b/i,
      /\b(?:exclud|disclaim)\w*\b.{0,65}?\b(?:consequential|indirect) damages\b/i,
    ],
    title: 'Some types of losses may not be covered',
    explanation:
      'The company may try to exclude responsibility for indirect losses, lost profits, or lost data. The scope and enforceability depend on the context and applicable law.',
    tip: 'Keep independent backups and check which losses, warranties, and legal rights are expressly preserved.',
  },
  {
    id: 'indefinite-retention',
    category: 'Data retention',
    severity: 'high',
    patterns: [
      /\b(?:retain|store|keep)\w*\b.{0,90}?\b(?:data|information)\b.{0,65}?\b(?:indefinitely|as long as we (?:wish|choose|deem necessary)|unlimited period)\b/i,
      /\b(?:data|information)\b.{0,50}?\bretained indefinitely\b/i,
    ],
    title: 'Your data may have no clear deletion date',
    explanation:
      'This wording suggests indefinite retention or gives the company wide discretion over how long it keeps information.',
    tip: 'Ask for the retention schedule by data type and check how to request deletion, including any legal exceptions.',
  },
  {
    id: 'post-closure-retention',
    category: 'Data retention',
    severity: 'medium',
    patterns: [
      /\b(?:retain|keep|store)\w*\b.{0,90}?\b(?:after|following)\b.{0,65}?\b(?:clos|delet|terminat)\w*\b/i,
      /\b(?:after|following)\b.{0,55}?\b(?:clos|delet|terminat)\w*\b.{0,85}?\b(?:retain|keep|store)\w*\b/i,
    ],
    title: 'Closing your account may not erase your data',
    explanation:
      'Some information may remain after account closure or a deletion request. The clause should explain the reasons, types of data, and retention periods.',
    tip: 'Check whether closing the account and requesting data deletion are separate steps, and ask about backup copies.',
  },
  {
    id: 'discretionary-termination',
    category: 'Account termination',
    severity: 'high',
    patterns: [
      /\b(?:suspend|terminate|disable)\w*\b.{0,60}?\b(?:account|access)\b.{0,95}?\b(?:any reason|sole discretion|without (?:prior )?notice|at any time)\b/i,
    ],
    title: 'Your account may be closed at the company’s discretion',
    explanation:
      'The service may reserve broad authority to suspend or end your access, potentially without notice or a specific reason.',
    tip: 'Look for warning, appeal, refund, and data-export rights. Keep copies of anything you cannot afford to lose.',
  },
  {
    id: 'termination-data-loss',
    category: 'Account termination',
    severity: 'medium',
    patterns: [
      /\b(?:terminat|suspend|clos)\w*\b.{0,90}?\b(?:delete|deleted|lose access|loss of|forfeit)\b.{0,65}?\b(?:data|content|files|credits)\b/i,
    ],
    title: 'Ending access may also mean losing files or credits',
    explanation:
      'Termination may lead to removal of your content, loss of file access, or forfeiture of unused credits. Recovery might not be guaranteed.',
    tip: 'Check export and recovery windows. Download important files before canceling or disputing an account decision.',
  },
  {
    id: 'external-provider-sharing',
    category: 'Third-party sharing',
    severity: 'medium',
    patterns: [
      /\b(?:share|disclose|provide|transfer)\w*\b.{0,85}?\b(?:data|information)\b.{0,85}?\b(?:third parties|third[- ]party|service providers|business partners|advertising partners)\b/i,
    ],
    title: 'Outside organizations may receive your information',
    explanation:
      'Your information may be shared with external organizations. Service providers can be necessary, but the purpose, safeguards, and recipients still matter.',
    tip: 'Check the recipient list, what each receives, whether they can use it independently, and available sharing controls.',
  },
  {
    id: 'third-party-responsibility',
    category: 'Third-party sharing',
    severity: 'low',
    patterns: [
      /\b(?:not responsible|no responsibility|no control)\b.{0,110}?\b(?:third[- ]party|third parties|external (?:sites|services))\b/i,
      /\bthird[- ]party\b.{0,60}?\b(?:own|separate) (?:terms|privacy polic)\w*\b/i,
    ],
    title: 'Other services may have different privacy rules',
    explanation:
      'Linked or integrated services may follow their own policies, and this company may disclaim control over them. Protections do not necessarily carry over.',
    tip: 'Read the policies of external services before connecting an account or sending them sensitive information.',
  },
];
