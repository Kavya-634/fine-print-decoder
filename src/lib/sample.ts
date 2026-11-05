// Fictional teaching policies, not real companies or legal templates. Each has
// at least five independent rule triggers for instant, grounded summary testing.
export const samplePolicies = [
  {
    id: 'subscription',
    name: 'Subscription App',
    text: `SUBSCRIPTION APP — FICTIONAL TERMS & PRIVACY POLICY

1. Your information
We may share your personal information with advertising partners to support personalized advertising.
We use third-party cookies to track your activity across websites.

2. Your subscription
Your subscription will automatically renew at the current monthly price unless you cancel before the next billing date.
All payments are non-refundable, except where required by applicable law.

3. Resolving disputes
Any dispute arising from these terms will be resolved through binding arbitration, except for eligible small-claims matters.
You waive your right to participate in a class action.

4. Your content
You grant us a worldwide, royalty-free, perpetual license to use your content to operate and promote the service.

5. Updates to these terms
We may modify these terms at any time without prior notice.
Your continued use of the service constitutes acceptance of the revised terms.

6. Closing your account
We may retain your information after you delete your account to comply with legal obligations.

This is a fictional example for demonstrating the decoder, not a real agreement.`,
  },
  {
    id: 'social',
    name: 'Social Network',
    text: `SOCIAL NETWORK — FICTIONAL TERMS & PRIVACY POLICY

1. Information across our services
We may sell your personal information to marketing partners, subject to available opt-out rights.
We share your information with our affiliates to support linked accounts.
Your information may be transferred as part of a merger or acquisition.

2. Advertising and your activity
We combine your information with data from third parties to understand your interests.
We use your information for personalized advertising.
We track your activity across websites using advertising cookies.

3. Posts and photos
You grant us a worldwide, royalty-free license to your content for operating and promoting the service.
We may use your content for commercial and marketing purposes.

4. Accounts and storage
We may terminate your account at our sole discretion.
Upon termination, we may delete your content and files.
We retain your data indefinitely unless applicable law requires deletion.

5. External services
Third-party services have their own privacy policies.

This is a fictional example for demonstrating the decoder, not a real agreement.`,
  },
  {
    id: 'game',
    name: 'Free Mobile Game',
    text: `FREE MOBILE GAME — FICTIONAL TERMS & PRIVACY POLICY

1. A free game supported by ads
We use device fingerprinting to recognize your device.
We may share your information with advertising partners.
We use your activity for targeted advertising.

2. Optional premium pass
At the end of your free trial, you will be charged the current monthly fee.
Your premium pass automatically renews each month.
You must cancel by telephone at least 7 days before renewal.
All purchases are non-refundable except where local law requires otherwise.

3. Virtual items and account access
Upon termination, you may lose access to your credits and files.
We may suspend your account without prior notice.

4. Responsibility and disputes
Our total liability shall not exceed the amount you paid us during the previous month.
We will not be liable for indirect or consequential damages, to the extent allowed by law.
All disputes are subject to binding arbitration, except where prohibited.

5. Linked services
We are not responsible for the privacy practices of third-party services.

This is a fictional example for demonstrating the decoder, not a real agreement.`,
  },
] as const;

// Preserve the original "Try an example" paste-only shortcut.
export const samplePolicy = samplePolicies[0].text;
