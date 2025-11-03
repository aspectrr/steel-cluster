// Imported older colour definitions from Radix UI
// https://github.com/radix-ui/colors/tree/800c1da068cbfaa4b9701eda6977a006480bcb67

const sandDark = {
  sand1: "hsl(61, 2.0%, 8.3%)",
  sand2: "hsl(60, 3.7%, 10.6%)",
  sand3: "hsl(58, 3.7%, 13.1%)",
  sand4: "hsl(57, 3.6%, 15.3%)",
  sand5: "hsl(56, 3.7%, 17.4%)",
  sand6: "hsl(55, 3.7%, 19.9%)",
  sand7: "hsl(53, 3.7%, 23.6%)",
  sand8: "hsl(50, 3.8%, 30.6%)",
  sand9: "hsl(50, 4.0%, 42.7%)",
  sand10: "hsl(52, 3.1%, 48.3%)",
  sand11: "hsl(50, 4.0%, 61.8%)",
  sand12: "hsl(56, 4.0%, 92.8%)",
};

const grayDark = {
  gray1: "hsl(0, 0%, 8.5%)",
  gray2: "hsl(0, 0%, 11.0%)",
  gray3: "hsl(0, 0%, 13.6%)",
  gray4: "hsl(0, 0%, 15.8%)",
  gray5: "hsl(0, 0%, 17.9%)",
  gray6: "hsl(0, 0%, 20.5%)",
  gray7: "hsl(0, 0%, 24.3%)",
  gray8: "hsl(0, 0%, 31.2%)",
  gray9: "hsl(0, 0%, 43.9%)",
  gray10: "hsl(0, 0%, 49.4%)",
  gray11: "hsl(0, 0%, 62.8%)",
  gray12: "hsl(0, 0%, 93.0%)",
};

const yellowDark = {
  yellow1: 'hsl(45, 100%, 5.5%)',
  yellow2: 'hsl(46, 100%, 6.7%)',
  yellow3: 'hsl(45, 100%, 8.7%)',
  yellow4: 'hsl(45, 100%, 10.4%)',
  yellow5: 'hsl(47, 100%, 12.1%)',
  yellow6: 'hsl(49, 100%, 14.3%)',
  yellow7: 'hsl(49, 90.3%, 18.4%)',
  yellow8: 'hsl(50, 100%, 22.0%)',
  yellow9: 'hsl(53, 92.0%, 50.0%)',
  yellow10: 'hsl(54, 100%, 68.0%)',
  yellow11: 'hsl(48, 100%, 47.0%)',
  yellow12: 'hsl(53, 100%, 91.0%)',
};

const greenDark = {
  green1: 'hsl(146, 30.0%, 7.4%)',
  green2: 'hsl(155, 44.2%, 8.4%)',
  green3: 'hsl(155, 46.7%, 10.9%)',
  green4: 'hsl(154, 48.4%, 12.9%)',
  green5: 'hsl(154, 49.7%, 14.9%)',
  green6: 'hsl(154, 50.9%, 17.6%)',
  green7: 'hsl(153, 51.8%, 21.8%)',
  green8: 'hsl(151, 51.7%, 28.4%)',
  green9: 'hsl(151, 55.0%, 41.5%)',
  green10: 'hsl(151, 49.3%, 46.5%)',
  green11: 'hsl(151, 50.0%, 53.2%)',
  green12: 'hsl(137, 72.0%, 94.0%)',
};

export const blueDark = {
  blue1: 'hsl(212, 35.0%, 9.2%)',
  blue2: 'hsl(216, 50.0%, 11.8%)',
  blue3: 'hsl(214, 59.4%, 15.3%)',
  blue4: 'hsl(214, 65.8%, 17.9%)',
  blue5: 'hsl(213, 71.2%, 20.2%)',
  blue6: 'hsl(212, 77.4%, 23.1%)',
  blue7: 'hsl(211, 85.1%, 27.4%)',
  blue8: 'hsl(211, 89.7%, 34.1%)',
  blue9: 'hsl(206, 100%, 50.0%)',
  blue10: 'hsl(209, 100%, 60.6%)',
  blue11: 'hsl(210, 100%, 66.1%)',
  blue12: 'hsl(206, 98.0%, 95.8%)',
};

export const skyDark = {
  sky1: 'hsl(205, 45.0%, 8.6%)',
  sky2: 'hsl(202, 71.4%, 9.6%)',
  sky3: 'hsl(201, 74.6%, 12.2%)',
  sky4: 'hsl(201, 77.4%, 14.4%)',
  sky5: 'hsl(200, 80.3%, 16.5%)',
  sky6: 'hsl(200, 84.1%, 18.9%)',
  sky7: 'hsl(199, 90.2%, 22.1%)',
  sky8: 'hsl(198, 100%, 26.1%)',
  sky9: 'hsl(193, 98.0%, 70.0%)',
  sky10: 'hsl(192, 100%, 77.0%)',
  sky11: 'hsl(192, 85.0%, 55.8%)',
  sky12: 'hsl(198, 98.0%, 95.8%)',
};

export const redDark = {
  red1: 'hsl(353, 23.0%, 9.8%)',
  red2: 'hsl(357, 34.4%, 12.0%)',
  red3: 'hsl(356, 43.4%, 16.4%)',
  red4: 'hsl(356, 47.6%, 19.2%)',
  red5: 'hsl(356, 51.1%, 21.9%)',
  red6: 'hsl(356, 55.2%, 25.9%)',
  red7: 'hsl(357, 60.2%, 31.8%)',
  red8: 'hsl(358, 65.0%, 40.4%)',
  red9: 'hsl(358, 75.0%, 59.0%)',
  red10: 'hsl(358, 85.3%, 64.0%)',
  red11: 'hsl(358, 100%, 69.5%)',
  red12: 'hsl(351, 89.0%, 96.0%)',
};

function flatten(prefix, colors) {
  return Object.fromEntries(
    Object.entries(colors).map(([k, v]) => {
      const num = k.replace(/\D/g, "");
      return [`${prefix}-${num}`, v];
    }),
  );
}

export const radixColors = {
  ...flatten("dark-gray", grayDark),
  ...flatten("dark-sand", sandDark),
  ...flatten("dark-yellow", yellowDark),
  ...flatten("dark-green", greenDark),
  ...flatten("dark-blue", blueDark),
  ...flatten("dark-sky", skyDark),
  ...flatten("dark-red", redDark),
};